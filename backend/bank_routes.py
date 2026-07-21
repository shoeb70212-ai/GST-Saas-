import os
import uuid
import logging
import pandas as pd
import io
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Form, Depends
from fastapi.responses import StreamingResponse
from supabase import create_async_client
from bank_service import process_bank_statement_bg
from utils import ensure_sufficient_credits, verify_client_access, get_current_user
import credits as credit_costs

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


async def _admin_storage_client():
    """Service-role client for storage uploads (bypasses bucket RLS gaps)."""
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    return await create_async_client(SUPABASE_URL, key)


async def _store_statement_file(client_id: str, statement_id: str, ext: str, content: bytes, content_type: str) -> str | None:
    """Upload to invoices bucket. Returns storage path or None if upload failed."""
    file_path = f"{client_id}/bank_{statement_id}{ext}"
    try:
        admin = await _admin_storage_client()
        await admin.storage.from_("invoices").upload(
            file_path,
            content,
            {"content-type": content_type or "application/octet-stream", "upsert": "true"},
        )
        return file_path
    except Exception as e:
        logger.error(f"Storage upload failed for {statement_id}: {e}")
        return None


async def _prepare_statement_content(
    content: bytes,
    filename: str | None,
    pdf_password: str | None,
) -> tuple[bytes, str, int]:
    """Validate file, return (content, extension, credit_cost)."""
    import fitz

    _, ext = os.path.splitext(filename or "")
    ext = ext.lower()
    if ext not in ['.pdf', '.xlsx', '.xls', '.csv']:
        ext = '.pdf'

    cost = credit_costs.BANK_BASE
    if ext == '.pdf':
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            if doc.needs_pass:
                if not (pdf_password and str(pdf_password).strip()):
                    raise ValueError(
                        "This PDF is password-protected. Enter the PDF password above and try again."
                    )
                auth_ok = doc.authenticate(str(pdf_password).strip())
                if not auth_ok:
                    raise ValueError("Incorrect PDF password. Please check the password and try again.")
                # Persist an unlocked copy so background processing does not need the password again
                content = doc.tobytes(garbage=3, deflate=True)
                doc.close()
                doc = fitz.open(stream=content, filetype="pdf")
                if doc.needs_pass:
                    raise ValueError("Could not unlock PDF even after password authentication.")
            cost = credit_costs.bank_pdf_cost(len(doc))
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to open/calculate PDF cost: {e}")
            raise HTTPException(status_code=400, detail=f"Could not read PDF statement: {e}")
    elif ext in ['.xlsx', '.xls', '.csv']:
        try:
            if ext == '.csv':
                df = pd.read_csv(io.BytesIO(content))
                total_rows = len(df)
            else:
                dfs = _read_excel_workbook(content, ext)
                total_rows = sum(len(df) for df in dfs.values())
            cost = credit_costs.bank_spreadsheet_cost(total_rows)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to calculate Excel cost: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Could not read spreadsheet ({ext}). Ensure the file is a valid Excel/CSV export. Details: {e}",
            )

    return content, ext, cost


async def _verify_statement_access(sc, statement_id: str) -> str:
    """
    Ensure the caller can see this statement (RLS) and has client access.
    Returns client_id for further checks.
    """
    resp = await sc.table("bank_statements").select("id, client_id").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found or access denied")
    client_id = resp.data[0].get("client_id")
    if client_id:
        await verify_client_access(sc, client_id)
    return client_id


def _read_excel_workbook(content: bytes, ext: str):
    """Read .xls/.xlsx with an explicit engine so Coolify images don't silently miss deps."""
    bio = io.BytesIO(content)
    if ext == ".xls":
        return pd.read_excel(bio, sheet_name=None, engine="xlrd")
    return pd.read_excel(bio, sheet_name=None, engine="openpyxl")


@router.get("/list/{client_id}")
async def list_bank_statements(client_id: str, auth: dict = Depends(get_current_user)):
    """Returns all bank statements for a client, ordered newest first."""
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

    resp = await sc.table("bank_statements")\
        .select("id, bank_name, account_number, status, file_url, created_at, error_message")\
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
    auth: dict = Depends(get_current_user),
):
    user_id = auth["user_id"]
    sc = auth["supabase_client"]

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    await verify_client_access(sc, client_id)

    content, ext, cost = await _prepare_statement_content(content, file.filename, pdf_password)

    statement_id = str(uuid.uuid4())
    await sc.table("bank_statements").insert({
        "id": statement_id,
        "user_id": user_id,
        "client_id": client_id,
        "status": "processing",
        "error_message": None,
    }).execute()

    file_path = await _store_statement_file(
        client_id, statement_id, ext, content, file.content_type or "application/octet-stream"
    )
    update_payload = {}
    if file_path:
        update_payload["file_url"] = file_path
    else:
        # Still process in-memory; storage is best-effort for later viewing
        update_payload["error_message"] = "File stored in memory only — storage upload failed (will still process)."
    if update_payload:
        await sc.table("bank_statements").update(update_payload).eq("id", statement_id).execute()

    # Credits are charged only after a successful AI scan — verify balance upfront.
    try:
        await ensure_sufficient_credits(sc, user_id, cost)
    except HTTPException:
        await sc.table("bank_statements").update({
            "status": "failed",
            "error_message": f"Insufficient credits (need {cost}).",
        }).eq("id", statement_id).execute()
        raise

    background_tasks.add_task(
        process_bank_statement_bg,
        statement_id,
        content,
        user_id,
        client_id,
        ext,
        pdf_password,
        cost,
        file.filename,
    )

    return {
        "status": "success",
        "statement_id": statement_id,
        "message": "Bank statement is processing in the background.",
        "estimated_cost": cost,
    }


@router.post("/{statement_id}/retry")
async def retry_bank_statement(
    statement_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pdf_password: str = Form(None),
    auth: dict = Depends(get_current_user),
):
    """Re-upload a file for a failed/cancelled statement and restart processing."""
    user_id = auth["user_id"]
    sc = auth["supabase_client"]
    await _verify_statement_access(sc, statement_id)

    existing = await sc.table("bank_statements").select("id, client_id, status").eq("id", statement_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Statement not found.")

    row = existing.data[0]
    if row.get("status") not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled statements can be retried.")

    client_id = row["client_id"]

    content = await file.read()
    content, ext, cost = await _prepare_statement_content(content, file.filename, pdf_password)

    # Clear prior transactions before retry
    await sc.table("bank_transactions").delete().eq("statement_id", statement_id).execute()

    file_path = await _store_statement_file(
        client_id, statement_id, ext, content, file.content_type or "application/octet-stream"
    )

    await sc.table("bank_statements").update({
        "status": "processing",
        "bank_name": None,
        "account_number": None,
        "file_url": file_path,
        "error_message": None if file_path else "File stored in memory only — storage upload failed (will still process).",
    }).eq("id", statement_id).execute()

    try:
        await ensure_sufficient_credits(sc, user_id, cost)
    except HTTPException:
        await sc.table("bank_statements").update({
            "status": "failed",
            "error_message": f"Insufficient credits (need {cost}).",
        }).eq("id", statement_id).execute()
        raise

    background_tasks.add_task(
        process_bank_statement_bg,
        statement_id,
        content,
        user_id,
        client_id,
        ext,
        pdf_password,
        cost,
        file.filename,
    )

    return {
        "status": "success",
        "statement_id": statement_id,
        "message": "Retry started.",
        "estimated_cost": cost,
    }


@router.get("/{statement_id}/status")
async def get_statement_status(statement_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]

    # Ownership check (RLS enforces this, but explicit check gives better error)
    await _verify_statement_access(sc, statement_id)

    resp = await sc.table("bank_statements").select("status, bank_name, account_number, file_url").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found.")

    statement_data = resp.data[0]
    
    # Generate a fresh signed URL on-demand from the stored storage path (fixes #23)
    stored_path = statement_data.get("file_url")
    if stored_path and not stored_path.startswith("http"):
        try:
            admin = await _admin_storage_client()
            signed_url_resp = await admin.storage.from_("invoices").create_signed_url(stored_path, 3600)
            if signed_url_resp and getattr(signed_url_resp, "get", None):
                statement_data["file_url"] = signed_url_resp.get("signedURL") or signed_url_resp.get("signedUrl")
            elif getattr(signed_url_resp, "data", None):
                statement_data["file_url"] = signed_url_resp.data.get("signedURL") or signed_url_resp.data.get("signedUrl")
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for statement {statement_id}: {e}")

    return {"status": "success", "data": statement_data}


@router.post("/{statement_id}/cancel")
async def cancel_statement(statement_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]

    # Ownership check
    await _verify_statement_access(sc, statement_id)

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
async def get_transactions(statement_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]

    # Ownership check
    await _verify_statement_access(sc, statement_id)

    resp = await sc.table("bank_transactions").select("*").eq("statement_id", statement_id).order("txn_date").execute()
    return {"status": "success", "data": resp.data}


@router.get("/{statement_id}/export")
async def export_excel(statement_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]

    # Ownership check
    await _verify_statement_access(sc, statement_id)

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