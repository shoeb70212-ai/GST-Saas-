import os
import uuid
import asyncio
from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from supabase import create_async_client
import httpx
from utils import validate_file_content, sanitize_filename, compute_file_hash, SUPABASE_URL, SUPABASE_SERVICE_KEY
# to avoid circular imports, import run_ai_extraction where used

router = APIRouter()

# Limit concurrent AI calls for public uploads
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

async def process_public_worker(invoice_id: str, content: bytes, mime_type: str, user_id: str, tally_ledgers: list = None):
    """
    Background worker for processing public client uploads securely.
    Uses admin service role to bypass RLS since the client isn't logged in.
    """
    supabase_client = await get_admin_client()
    try:
        sem = await get_public_semaphore()
        async with sem:
            from main import run_ai_extraction
            data_dict, tokens = await run_ai_extraction(content, mime_type, tally_ledgers)
        
        # Verify GSTIN if exists
        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            from gstin_service import verify_gstin
            data_dict["Supplier_GSTIN_Status"] = await verify_gstin(supabase_client, gstin)

        # Deduct Credit (using RPC via http client since RPC via python client can be tricky without auth)
        async with httpx.AsyncClient() as http_client:
            rpc_resp = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
                headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "Content-Type": "application/json"},
                json={
                    "user_id_param": user_id,
                    "amount": 1,
                    "task_type_param": "public_upload",
                    "file_name_param": f"public_{invoice_id}",
                    "tokens_used_param": tokens
                }
            )
        
        # Check RPC result — if -1, the organization is out of credits (fixes free processing exploit)
        if rpc_resp.status_code == 200:
            rpc_result = rpc_resp.json()
            if rpc_result == -1:
                await supabase_client.table("invoices").update({
                    "processing_status": "failed",
                    "error_message": "Insufficient credits. Please recharge your wallet."
                }).eq("id", invoice_id).execute()
                return
        else:
            await supabase_client.table("invoices").update({
                "processing_status": "failed",
                "error_message": "Credit deduction service unavailable."
            }).eq("id", invoice_id).execute()
            return

        # Prepare update payload
        from batch_routes import format_date_to_iso
        db_update = {k.lower(): v for k, v in data_dict.items() if k != "Line_Items"}
        
        if "invoice_date" in db_update:
            db_update["invoice_date"] = format_date_to_iso(db_update["invoice_date"])
        if "due_date" in db_update:
            db_update["due_date"] = format_date_to_iso(db_update["due_date"])
            
        db_update["processing_status"] = "completed"
        db_update["error_message"] = None
        
        # Update Invoice Record
        await supabase_client.table("invoices").update(db_update).eq("id", invoice_id).execute()
        
        # Insert Line Items
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
                    "amount": li.get("Amount")
                })
            await supabase_client.table("invoice_line_items").insert(items_payload).execute()
            
    except Exception as e:
        # Mark as failed
        await supabase_client.table("invoices").update({"processing_status": "failed", "error_message": str(e)}).eq("id", invoice_id).execute()


@router.get("/client/{client_id}")
async def get_client_info(client_id: str):
    supabase_client = await get_admin_client()
    resp = await supabase_client.table("clients").select("client_name, user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"client_name": resp.data[0]["client_name"]}


@router.post("/upload")
async def public_upload(
    background_tasks: BackgroundTasks,
    request: Request,
    client_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    supabase_client = await get_admin_client()
    
    # Validate client exists
    resp = await supabase_client.table("clients").select("user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
        
    user_id = resp.data[0]["user_id"]
    
    # Rate Limiting / Denial of Wallet Prevention
    # Ensure public links aren't abused to drain firm credits
    import datetime
    today_start = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    limit_resp = await supabase_client.table("invoices").select("id", count="exact").eq("client_id", client_id).gte("created_at", today_start).execute()
        
    if limit_resp.count and limit_resp.count >= 200:
        raise HTTPException(status_code=429, detail="Daily public upload limit exceeded for this client. Please try again tomorrow or ask your CA to upload internally.")
    
    profile_resp = await supabase_client.table("profiles").select("tally_ledgers").eq("id", user_id).execute()
    tally_ledgers = profile_resp.data[0].get("tally_ledgers") if profile_resp.data else None
    
    uploaded_count = 0
    duplicate_count = 0
    queued_ids = []
    
    for file in files:
        content = await file.read()
        
        # Security: Validate file content
        mime_type = validate_file_content(content, file.filename)
        safe_filename = sanitize_filename(file.filename)
        file_ext = os.path.splitext(safe_filename)[1]
        
        # File Deduplication (SHA-256)
        file_hash = compute_file_hash(content)
        
        # Check if already exists
        dup_check = await supabase_client.table("invoices").select("id").eq("client_id", client_id).eq("file_hash", file_hash).execute()
        if dup_check.data and len(dup_check.data) > 0:
            duplicate_count += 1
            continue
            
        storage_path = f"{user_id}/{client_id}/{uuid.uuid4()}{file_ext}"
        
        # Upload to storage using HTTPX because Python supabase-storage-py is sync
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{SUPABASE_URL}/storage/v1/object/raw_invoices/{storage_path}",
                headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "Content-Type": mime_type},
                content=content
            )
            
        # Insert pending record
        ins_resp = await supabase_client.table("invoices").insert({
            "user_id": user_id,
            "client_id": client_id,
            "file_name": safe_filename,
            "processing_status": "pending_from_client",
            "file_hash": file_hash,
            "storage_path": storage_path,
            "invoice_number": f"CLIENT-{uuid.uuid4().hex[:8]}"
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
                tally_ledgers=tally_ledgers
            )
            uploaded_count += 1
            
    if duplicate_count > 0 and uploaded_count == 0:
        raise HTTPException(status_code=409, detail="Duplicate file. This document has already been submitted.")
        
    return {"status": "success", "message": f"Queued {uploaded_count} files.", "duplicates_skipped": duplicate_count, "queued_ids": queued_ids}
