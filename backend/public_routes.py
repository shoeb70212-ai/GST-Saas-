import os
import uuid
import asyncio
import datetime
import logging
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request, Depends, Query
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from supabase import create_async_client
from http_client import get_shared_client
from utils import validate_file_content, sanitize_filename, compute_file_hash, SUPABASE_URL, SUPABASE_SERVICE_KEY, get_current_user
from public_upload_tokens import create_public_upload_token, verify_public_upload_token

logger = logging.getLogger(__name__)

router = APIRouter()

limiter = Limiter(key_func=get_remote_address)

public_ai_semaphore = None


async def get_public_semaphore():
    global public_ai_semaphore
    if public_ai_semaphore is None:
        public_ai_semaphore = asyncio.Semaphore(5)
    return public_ai_semaphore


async def get_admin_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase service key configuration.")
    return await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def _rpc_decrement_credit(user_id: str, file_name: str, tokens_used: int = 0) -> int:
    """Returns RPC result: remaining credits, or -1 if insufficient."""
    async with get_shared_client() as http_client:
        rpc_resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "user_id_param": user_id,
                "amount": 1,
                "task_type_param": "public_upload",
                "file_name_param": file_name,
                "tokens_used_param": tokens_used,
            },
        )
    if rpc_resp.status_code != 200:
        logger.error("Public upload credit deduct failed: %s", rpc_resp.text)
        raise HTTPException(status_code=500, detail="Credit deduction service unavailable")
    return rpc_resp.json()


async def _rpc_refund_credit(user_id: str, amount: int = 1) -> None:
    async with get_shared_client() as http_client:
        await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refund_credits",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"user_id_param": user_id, "amount": amount},
        )


async def process_public_worker(
    invoice_id: str,
    content: bytes,
    mime_type: str,
    user_id: str,
    tally_ledgers: list | None = None,
    credit_charged: bool = True,
):
    """
    Background worker for processing public client uploads securely.
    Credits are deducted before this worker runs; refund on AI failure.
    """
    supabase_client = await get_admin_client()
    try:
        sem = await get_public_semaphore()
        async with sem:
            from main import run_ai_extraction
            try:
                data_dict, tokens = await run_ai_extraction(content, mime_type, tally_ledgers)
            except Exception as ai_e:
                if credit_charged:
                    await _rpc_refund_credit(user_id, 1)
                raise ai_e

        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            from gstin_service import verify_gstin
            data_dict["Supplier_GSTIN_Status"] = await verify_gstin(supabase_client, gstin)

        from batch_routes import format_date_to_iso
        db_update = {k.lower(): v for k, v in data_dict.items() if k != "Line_Items"}

        if "invoice_date" in db_update:
            db_update["invoice_date"] = format_date_to_iso(db_update["invoice_date"])
        if "due_date" in db_update:
            db_update["due_date"] = format_date_to_iso(db_update["due_date"])

        db_update["processing_status"] = "completed"
        db_update["error_message"] = None

        await supabase_client.table("invoices").update(db_update).eq("id", invoice_id).execute()

        line_items = data_dict.get("Line_Items", [])
        if line_items:
            items_payload = []
            for li in line_items:
                items_payload.append({
                    "invoice_id": invoice_id,
                    "description": li.get("Description"),
                    "hsn_sac": li.get("HSN_SAC"),
                    "quantity": li.get("Quantity"),
                    "unit_price": li.get("Unit_Price"),
                    "tax_rate": li.get("Tax_Rate"),
                    "amount": li.get("Amount"),
                })
            await supabase_client.table("invoice_line_items").insert(items_payload).execute()

    except Exception as e:
        await supabase_client.table("invoices").update({
            "processing_status": "failed",
            "error_message": str(e),
        }).eq("id", invoice_id).execute()


class IssueTokenRequest(BaseModel):
    client_id: str


@router.post("/issue-token")
async def issue_portal_token(body: IssueTokenRequest, auth: dict = Depends(get_current_user)):
    """Authenticated CA endpoint — mint a signed, time-limited portal upload token."""
    sc = auth["supabase_client"]
    resp = await sc.table("clients").select("id, client_name").eq("id", body.client_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client not found or access denied")

    token, expires_at = create_public_upload_token(body.client_id)
    return {
        "upload_token": token,
        "expires_at": expires_at,
        "portal_url": f"/portal/{body.client_id}?token={token}",
        "snap_url": f"/snap/{body.client_id}?token={token}",
    }


@router.get("/client/{client_id}")
@limiter.limit("120/hour")
async def get_client_info(request: Request, client_id: str, token: str = Query(...)):
    verify_public_upload_token(client_id, token)

    supabase_client = await get_admin_client()
    resp = await supabase_client.table("clients").select("client_name").eq("id", client_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"client_name": resp.data[0]["client_name"]}


@router.post("/upload")
@limiter.limit("60/hour")
async def public_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Form(...),
    upload_token: str = Form(...),
    files: List[UploadFile] = File(...),
):
    verify_public_upload_token(client_id, upload_token)

    supabase_client = await get_admin_client()

    resp = await supabase_client.table("clients").select("user_id").eq("id", client_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client not found")

    user_id = resp.data[0]["user_id"]

    today_start = datetime.datetime.now(datetime.timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    limit_resp = await supabase_client.table("invoices").select(
        "id", count="exact"
    ).eq("client_id", client_id).gte("created_at", today_start).execute()

    if limit_resp.count and limit_resp.count >= 200:
        raise HTTPException(
            status_code=429,
            detail="Daily public upload limit exceeded for this client. Please try again tomorrow or ask your CA to upload internally.",
        )

    profile_resp = await supabase_client.table("profiles").select("tally_ledgers").eq("id", user_id).execute()
    tally_ledgers = profile_resp.data[0].get("tally_ledgers") if profile_resp.data else None

    uploaded_count = 0
    duplicate_count = 0
    queued_ids = []

    for file in files:
        content = await file.read()

        mime_type = validate_file_content(content, file.filename)
        safe_filename = sanitize_filename(file.filename)
        file_ext = os.path.splitext(safe_filename)[1]
        file_hash = compute_file_hash(content)

        dup_check = await supabase_client.table("invoices").select("id").eq(
            "client_id", client_id
        ).eq("file_hash", file_hash).execute()
        if dup_check.data:
            duplicate_count += 1
            continue

        deduct_result = await _rpc_decrement_credit(user_id, safe_filename)
        if deduct_result == -1:
            if uploaded_count == 0 and duplicate_count == 0:
                raise HTTPException(
                    status_code=402,
                    detail="Insufficient credits. Please ask your accountant to recharge their wallet.",
                )
            break

        storage_path = f"{user_id}/{client_id}/{uuid.uuid4()}{file_ext}"

        async with get_shared_client() as http_client:
            storage_resp = await http_client.post(
                f"{SUPABASE_URL}/storage/v1/object/raw_invoices/{storage_path}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": mime_type,
                },
                content=content,
            )
            if storage_resp.status_code not in (200, 201):
                await _rpc_refund_credit(user_id, 1)
                raise HTTPException(status_code=500, detail="Failed to store uploaded file")

        ins_resp = await supabase_client.table("invoices").insert({
            "user_id": user_id,
            "client_id": client_id,
            "file_name": safe_filename,
            "processing_status": "pending_from_client",
            "file_hash": file_hash,
            "storage_path": storage_path,
            "invoice_number": f"CLIENT-{uuid.uuid4().hex[:8]}",
        }).execute()

        if ins_resp.data:
            invoice_id = ins_resp.data[0]["id"]
            queued_ids.append(invoice_id)

            background_tasks.add_task(
                process_public_worker,
                invoice_id=invoice_id,
                content=content,
                mime_type=mime_type,
                user_id=user_id,
                tally_ledgers=tally_ledgers,
                credit_charged=True,
            )
            uploaded_count += 1

    if duplicate_count > 0 and uploaded_count == 0:
        raise HTTPException(status_code=409, detail="Duplicate file. This document has already been submitted.")

    return {
        "status": "success",
        "message": f"Queued {uploaded_count} files.",
        "duplicates_skipped": duplicate_count,
        "queued_ids": queued_ids,
    }
