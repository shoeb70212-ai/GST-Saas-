import os
import uuid
import logging
import httpx
import pandas as pd
import io
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
from supabase import create_async_client
from bank_service import process_bank_statement_bg
from utils import get_user_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")


async def get_user_from_token(token: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        return resp.json().get("id")


async def _verify_client_ownership(sc, client_id: str, user_id: str):
    """Verify that a client_id belongs to the authenticated user."""
    client_resp = await sc.table("clients").select("id").eq("id", client_id).eq("user_id", user_id).execute()
    if not client_resp.data:
        raise HTTPException(status_code=403, detail="Access denied: client not found")


async def _verify_statement_ownership(sc, statement_id: str):
    """Verify that a statement belongs to the authenticated user (via RLS)."""
    resp = await sc.table("bank_statements").select("id").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found or access denied")


@router.get("/list/{client_id}")
async def list_bank_statements(client_id: str, authorization: str = Header(None)):
    """Returns all bank statements for a client, ordered newest first."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.split(" ")[1]
    user_id = await get_user_from_token(token)

    sc = await get_user_supabase_client(authorization)

    # Ownership check: verify client belongs to user
    await _verify_client_ownership(sc, client_id, user_id)

    resp = await sc.table("bank_statements")\
        .select("id, bank_name, account_number, status, file_url, created_at")\
        .eq("client_id", client_id)\
        .order("created_at", desc=True)\
        .execute()

    return {"status": "success", "data": resp.data}


@router.post("/upload")
async def upload_bank_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    pdf_password: str = Form(None),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    user_id = await get_user_from_token(token)

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    sc = await get_user_supabase_client(authorization)

    # Ownership check: verify client belongs to user
    await _verify_client_ownership(sc, client_id, user_id)

    import math
    import fitz

    # Extract file extension
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ['.pdf', '.xlsx', '.xls', '.csv']:
        ext = '.pdf'

    # Calculate Volume-Based Cost
    cost = 2
    if ext == '.pdf':
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            if doc.needs_pass:
                auth_result = doc.authenticate(pdf_password) if pdf_password else 0
                if not pdf_password or not auth_result:
                    raise ValueError("This PDF is password-protected. Please provide the correct password.")
                from utils import remove_pdf_password_if_present
                c_bytes = remove_pdf_password_if_present(content, pdf_password)
                doc = fitz.open(stream=c_bytes, filetype="pdf")
                if doc.needs_pass:
                    doc.authenticate(pdf_password)
                content = doc.tobytes()
            cost = max(2, math.ceil(len(doc) / 5) * 2)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            logger.error(f"Failed to calculate PDF cost: {e}")
    elif ext in ['.xlsx', '.xls', '.csv']:
        try:
            if ext == '.csv':
                df = pd.read_csv(io.BytesIO(content))
                total_rows = len(df)
            else:
                dfs = pd.read_excel(io.BytesIO(content), sheet_name=None)
                total_rows = sum(len(df) for df in dfs.values())
            cost = max(2, math.ceil(total_rows / 50) * 2)
        except Exception as e:
            logger.error(f"Failed to calculate Excel cost: {e}")

    # NOTE: Removed non-atomic pre-check — rely solely on atomic RPC return value (fixes race condition H2)

    statement_id = str(uuid.uuid4())

    # Create DB record
    await sc.table("bank_statements").insert({
        "id": statement_id,
        "user_id": user_id,
        "client_id": client_id,
        "status": "processing"
    }).execute()

    # Upload original to Supabase Storage — store PATH (not expiring signed URL) (fixes #23)
    file_path = f"{client_id}/bank_{statement_id}{ext}"
    content_type = file.content_type or "application/pdf"
    try:
        await sc.storage.from_("invoices").upload(file_path, content, {"content-type": content_type})
        # Store the storage path — signed URLs are generated on-demand in the status endpoint
        await sc.table("bank_statements").update({"file_url": file_path}).eq("id", statement_id).execute()
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")

    # Deduct credit via atomic RPC (removes race condition — H2 fix)
    rpc_resp = await sc.rpc("decrement_credits", {
        "user_id_param": user_id,
        "amount": cost,
        "task_type_param": "bank_statement_upload",
        "file_name_param": file.filename,
        "tokens_used_param": 0
    }).execute()

    if rpc_resp.data == -1:
        # Revert processing status
        await sc.table("bank_statements").update({"status": "failed"}).eq("id", statement_id).execute()
        raise HTTPException(status_code=402, detail=f"Insufficient credits. This {cost * 5}-page/row statement requires {cost} credits. Please recharge your wallet.")

    # Start background task
    background_tasks.add_task(process_bank_statement_bg, statement_id, content, user_id, client_id, ext, pdf_password, cost)

    return {"status": "success", "statement_id": statement_id, "message": "Bank statement is processing in the background.", "cost": cost}


@router.get("/{statement_id}/status")
async def get_statement_status(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    sc = await get_user_supabase_client(authorization)

    # Ownership check (RLS enforces this, but explicit check gives better error)
    await _verify_statement_ownership(sc, statement_id)

    resp = await sc.table("bank_statements").select("status, bank_name, account_number, file_url").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found.")

    statement_data = resp.data[0]
    
    # Generate a fresh signed URL on-demand from the stored storage path (fixes #23)
    stored_path = statement_data.get("file_url")
    if stored_path and not stored_path.startswith("http"):
        try:
            signed_url_resp = await sc.storage.from_("invoices").create_signed_url(stored_path, 3600)
            if signed_url_resp.data:
                statement_data["file_url"] = signed_url_resp.data.get("signedURL")
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for statement {statement_id}: {e}")

    return {"status": "success", "data": statement_data}


@router.post("/{statement_id}/cancel")
async def cancel_statement(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    sc = await get_user_supabase_client(authorization)

    # Ownership check
    await _verify_statement_ownership(sc, statement_id)

    resp = await sc.table("bank_statements").select("status").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found.")

    status = str(resp.data[0].get("status", ""))
    if not status.startswith("processing"):
        raise HTTPException(status_code=400, detail="Only processing statements can be cancelled.")

    await sc.table("bank_statements").update({"status": "cancelled"}).eq("id", statement_id).execute()
    await sc.table("bank_transactions").delete().eq("statement_id", statement_id).execute()

    return {"status": "success", "message": "Statement processing cancelled successfully."}


@router.get("/{statement_id}/transactions")
async def get_transactions(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    sc = await get_user_supabase_client(authorization)

    # Ownership check
    await _verify_statement_ownership(sc, statement_id)

    resp = await sc.table("bank_transactions").select("*").eq("statement_id", statement_id).order("txn_date").execute()
    return {"status": "success", "data": resp.data}


@router.get("/{statement_id}/export")
async def export_excel(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    sc = await get_user_supabase_client(authorization)

    # Ownership check
    await _verify_statement_ownership(sc, statement_id)

    # 1. Hard UI Block Enforced on Backend
    txns_resp = await sc.table("bank_transactions").select("*").eq("statement_id", statement_id).order("txn_date").execute()
    if not txns_resp.data:
        raise HTTPException(status_code=404, detail="No transactions found.")

    for txn in txns_resp.data:
        if txn.get("needs_manual_review") or txn.get("has_math_error"):
            raise HTTPException(status_code=400, detail="Cannot export. There are transactions that require manual review.")

    # 2. Export to Excel
    df = pd.DataFrame(txns_resp.data)

    # Drop internal columns safely
    cols_to_drop = ["id", "statement_id", "has_math_error", "needs_manual_review", "created_at"]
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns])

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Transactions")
    output.seek(0)

    headers = {
        'Content-Disposition': f'attachment; filename="bank_statement_{statement_id}.xlsx"'
    }

    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')