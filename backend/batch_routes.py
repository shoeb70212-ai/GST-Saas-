import zipfile
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Form, Depends
import os
from supabase import create_async_client
from utils import (
    validate_file_content,
    sanitize_filename,
    verify_client_access,
    get_current_user,
    format_date_to_iso,
    ensure_org_not_suspended,
)
import credits as credit_costs
from extraction import (
    preprocess_invoice_file,
    run_ai_extraction,
    persist_extracted_invoice,
)
from ops_log import build_ops_ctx, log_from_ctx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

# Backward-compatible re-export (tests import from batch_routes)
__all__ = ["router", "process_batch_worker", "format_date_to_iso", "upload_batch"]

router = APIRouter()


async def process_batch_worker(
    invoice_id: str,
    content: bytes,
    mime_type: str,
    user_id: str,
    token: str,
    tally_ledgers: list = None,
    supabase_client=None,
):
    """
    Background task for processing invoices submitted via a ZIP batch.

    Credits: 1 credit is deducted upfront per queued file in upload_batch.
    Policy: refund that 1 credit via refund_credits if this worker fails
    (AI or DB). Successful siblings keep their charge (partial-batch fair).
    """
    sc = supabase_client
    ops_ctx = build_ops_ctx(
        "batch",
        user_id=user_id,
        mime_type=mime_type,
    )
    try:
        if sc is None:
            sc = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
            sc.postgrest.auth(token)

        try:
            content, mime_type = preprocess_invoice_file(content, mime_type)
            ops_ctx["mime_type"] = mime_type
        except ValueError as ve:
            await log_from_ctx(
                ops_ctx,
                severity="warning",
                event_type="preprocess_failure",
                message=str(ve),
                meta={"invoice_id": invoice_id},
            )
            raise Exception(str(ve)) from ve

        data_dict, _tokens = await run_ai_extraction(
            content, mime_type, tally_ledgers, ops_ctx=ops_ctx
        )

        from gstin_service import verify_gstin

        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            data_dict["Supplier_GSTIN_Status"] = await verify_gstin(sc, gstin)

        await persist_extracted_invoice(sc, invoice_id, data_dict)

    except Exception as e:
        credit_outcome = "refunded"
        try:
            if sc is None:
                sc = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
                sc.postgrest.auth(token)
            try:
                await sc.rpc(
                    "refund_credits",
                    {
                        "user_id_param": user_id,
                        "amount": credit_costs.BATCH_PER_FILE,
                    },
                ).execute()
            except Exception as refund_e:
                credit_outcome = "refund_failed"
                logger.error(
                    "Failed to refund batch credit for invoice %s: %s",
                    invoice_id,
                    refund_e,
                )
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="channel_exception",
                message=str(e),
                meta={"invoice_id": invoice_id, "credit_outcome": credit_outcome, "refunded": credit_outcome == "refunded"},
            )
            await sc.table("invoices").update(
                {
                    "processing_status": "failed",
                    "error_message": str(e),
                }
            ).eq("id", invoice_id).execute()
        except Exception as cleanup_e:
            logger.error(
                "Batch worker cleanup failed for invoice %s: %s",
                invoice_id,
                cleanup_e,
            )


@router.post("/upload-batch")
async def upload_batch(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    auth: dict = Depends(get_current_user),
):
    user_id = auth["user_id"]
    token = auth["token"]
    supabase_client = auth["supabase_client"]

    await ensure_org_not_suspended(supabase_client, user_id)

    profile_resp = await supabase_client.table("profiles").select("tally_ledgers").eq("id", user_id).execute()
    tally_ledgers = profile_resp.data[0].get("tally_ledgers") if profile_resp.data else None

    await verify_client_access(supabase_client, client_id)

    try:
        with zipfile.ZipFile(file.file) as z:
            file_names = z.namelist()
            valid_exts = [".jpg", ".jpeg", ".png", ".pdf", ".webp"]
            valid_files = [
                f
                for f in file_names
                if any(f.lower().endswith(ext) for ext in valid_exts)
                and not f.startswith("__MACOSX")
            ]

            if not valid_files:
                raise HTTPException(status_code=400, detail="No valid images or PDFs found in ZIP.")

            batch_ids = []
            pending_records = []
            file_details = []
            total_uncompressed_size = 0
            MAX_TOTAL_SIZE = 50 * 1024 * 1024

            for fname in valid_files:
                file_info = z.getinfo(fname)
                total_uncompressed_size += file_info.file_size
                if total_uncompressed_size > MAX_TOTAL_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Zip archive is too large when uncompressed (Zip Bomb prevention).",
                    )

                file_bytes = z.read(fname)
                try:
                    mime_type = validate_file_content(file_bytes, fname)
                except HTTPException:
                    continue

                safe_fname = sanitize_filename(fname.split("/")[-1])
                import uuid

                pending_records.append(
                    {
                        "user_id": user_id,
                        "client_id": client_id,
                        "file_name": safe_fname,
                        "processing_status": "pending",
                        "invoice_number": f"PENDING-{uuid.uuid4().hex[:8]}",
                    }
                )
                file_details.append({"bytes": file_bytes, "mime": mime_type})

            if not pending_records:
                raise HTTPException(status_code=400, detail="No valid images or PDFs found in ZIP.")

            cost = credit_costs.batch_upload_cost(len(pending_records))

            rpc_resp = await supabase_client.rpc(
                "decrement_credits",
                {
                    "user_id_param": user_id,
                    "amount": cost,
                    "task_type_param": "batch_upload_upfront",
                    "file_name_param": file.filename,
                    "tokens_used_param": 0,
                },
            ).execute()

            if rpc_resp.data == -1:
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits. This batch contains {cost} invoices. Please recharge your wallet.",
                )

            try:
                ins_resp = await supabase_client.table("invoices").insert(pending_records).execute()
                if ins_resp.data:
                    for i, row in enumerate(ins_resp.data):
                        invoice_id = row["id"]
                        batch_ids.append(invoice_id)

                        background_tasks.add_task(
                            process_batch_worker,
                            invoice_id=invoice_id,
                            content=file_details[i]["bytes"],
                            mime_type=file_details[i]["mime"],
                            user_id=user_id,
                            token=token,
                            tally_ledgers=tally_ledgers,
                            supabase_client=supabase_client,
                        )
                else:
                    logger.error("Failed to bulk insert pending invoices after credit deduction")
                    await supabase_client.rpc(
                        "refund_credits",
                        {
                            "user_id_param": user_id,
                            "amount": cost,
                        },
                    ).execute()
                    raise HTTPException(status_code=500, detail="Failed to queue batch invoices.")
            except HTTPException:
                raise
            except Exception as insert_e:
                logger.error("Batch insert failed after credit deduction: %s", insert_e)
                try:
                    await supabase_client.rpc(
                        "refund_credits",
                        {
                            "user_id_param": user_id,
                            "amount": cost,
                        },
                    ).execute()
                except Exception as refund_e:
                    logger.error("Failed to refund batch credits: %s", refund_e)
                raise HTTPException(status_code=500, detail="Failed to queue batch invoices.")

            return {
                "status": "success",
                "message": f"Queued {len(batch_ids)} files for processing.",
                "queued_ids": batch_ids,
            }

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
