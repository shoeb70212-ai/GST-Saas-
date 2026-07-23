"""
Authenticated single-invoice scan route.

Extraction logic lives in extraction.py; this module keeps the HTTP surface thin.
"""
import logging
import asyncio

from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Depends, Request
from dotenv import load_dotenv

from utils import (
    validate_file_content,
    get_current_user,
    get_org_credits,
    ensure_org_not_suspended,
    resolve_active_org_id,
    verify_client_access,
)
from rate_limit import limiter
import credits as credit_costs
from ops_log import build_ops_ctx, log_from_ctx
from extraction import (
    client,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    preprocess_invoice_file,
    get_file_processing_semaphore,
    run_ai_extraction,
    deduct_credits_rpc,
    refund_credits_rpc,
    # Re-exports for main.py / tests that still import from scan_routes
    compute_confidence,
    apply_tax_calculations,
    InvoiceData,
    LineItem,
    AI_MODEL,
    AI_MODEL_PRIMARY,
    AI_MODEL_VERIFY,
)

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/scan-invoice")
@limiter.limit("30/minute")
async def scan_invoice(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(None),
    client_id: str | None = Form(None),
    auth: dict = Depends(get_current_user),
):
    """
    Primary endpoint for processing single invoice files (PDF/Images).

    Workflow:
    1. Authenticates the user via Supabase JWT (Depends(get_current_user)).
    2. Checks if the user has sufficient credits in their profile.
    3. Validates the file (magic bytes & size).
    4. Shared preprocess + AI extraction (`run_ai_extraction`).
    5. Checks the vendor GSTIN against the KYC Cache (Supabase RPC).
    6. Deducts 1 credit from the user's account.

    Optional ``client_id`` scopes duplicate detection to that client (multi-client firms).
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase configuration in .env.")

    if not client:
        raise HTTPException(
            status_code=500,
            detail="Missing API Key. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.",
        )

    user_id = auth["user_id"]
    token = auth["token"]
    sc = auth["supabase_client"]
    scan_cost = credit_costs.INVOICE_SCAN

    await ensure_org_not_suspended(sc, user_id)

    active_client_id = (client_id or "").strip() or None
    if active_client_id:
        await verify_client_access(sc, active_client_id)

    tally_ledgers = None
    try:
        profile_resp = await sc.table("profiles").select("tally_ledgers").eq("id", user_id).execute()
        if profile_resp.data:
            tally_ledgers = profile_resp.data[0].get("tally_ledgers")
    except Exception:
        tally_ledgers = None

    credits = await get_org_credits(sc, user_id)
    if credits <= 0:
        raise HTTPException(
            status_code=402, detail="Insufficient credits. Please recharge your wallet."
        )

    content = await file.read()
    mime_type = validate_file_content(content, file.filename)
    org_id = None
    try:
        org_id = await resolve_active_org_id(sc, user_id)
    except Exception:
        org_id = None
    ops_ctx = build_ops_ctx(
        "scan",
        user_id=user_id,
        org_id=org_id,
        file_name=file.filename,
        mime_type=mime_type,
    )
    ops_ctx["supabase_client"] = sc

    async with get_file_processing_semaphore():
        try:
            content, mime_type = await asyncio.to_thread(
                preprocess_invoice_file, content, mime_type, password
            )
            ops_ctx["mime_type"] = mime_type
        except ValueError as ve:
            await log_from_ctx(
                ops_ctx,
                severity="warning",
                event_type="preprocess_failure",
                message=str(ve),
                meta={"credit_outcome": "no_charge"},
            )
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="preprocess_failure",
                message=str(e),
                meta={"credit_outcome": "no_charge"},
            )
            raise HTTPException(
                status_code=500, detail=f"Failed to process file. Error: {str(e)}"
            )

    try:
        result = await deduct_credits_rpc(
            user_id=user_id,
            amount=scan_cost,
            task_type="invoice_scan",
            file_name=file.filename,
            token=token,
        )
        if result == -1:
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="credit_deduct_failed",
                message="decrement_credits returned -1",
                meta={"credit_outcome": "deduct_failed"},
            )
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please recharge your wallet.",
            )

        try:
            data_dict, tokens = await run_ai_extraction(
                content, mime_type, tally_ledgers, ops_ctx=ops_ctx
            )
        except Exception as ai_e:
            await refund_credits_rpc(
                user_id=user_id, amount=scan_cost, token=token
            )
            await log_from_ctx(
                ops_ctx,
                severity="error",
                event_type="channel_exception",
                message=str(ai_e),
                meta={"credit_outcome": "refunded", "refunded": True},
            )
            raise HTTPException(status_code=500, detail=str(ai_e)) from ai_e

        gstin = data_dict.get("Supplier_GSTIN")
        if gstin:
            try:
                from gstin_service import verify_gstin

                data_dict["Supplier_GSTIN_Status"] = await verify_gstin(sc, gstin)
            except Exception as gstin_e:
                logger.warning("GSTIN verification failed (non-blocking): %s", gstin_e)

            inv_num = data_dict.get("Invoice_Number")
            if inv_num:
                try:
                    dup_q = (
                        sc.table("invoices")
                        .select("id")
                        .eq("user_id", user_id)
                        .eq("supplier_gstin", gstin)
                        .eq("invoice_number", inv_num)
                    )
                    if active_client_id:
                        dup_q = dup_q.eq("client_id", active_client_id)
                    dup_resp = await dup_q.execute()
                    if dup_resp.data and len(dup_resp.data) > 0:
                        data_dict["Extraction_State"] = "duplicate_warning"
                        await log_from_ctx(
                            ops_ctx,
                            severity="warning",
                            event_type="duplicate_warning",
                            message="Possible duplicate invoice detected",
                            extraction_state="duplicate_warning",
                            confidence_score=data_dict.get("Confidence_Score"),
                            model_used=data_dict.get("Extraction_Model"),
                            meta={
                                "credit_outcome": "charged",
                                "client_id": active_client_id,
                            },
                        )
                except Exception as dup_e:
                    logger.warning(
                        "Duplicate detection check failed (non-blocking): %s", dup_e
                    )

        return {
            "status": "success",
            "data": data_dict,
            "tokens_used": tokens,
            "estimated_cost_inr": data_dict.get("Estimated_Cost_INR"),
            "cache_hit": bool(data_dict.get("Cache_Hit")),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Scan invoice error: %s", e, exc_info=True)
        await log_from_ctx(
            ops_ctx,
            severity="error",
            event_type="channel_exception",
            message=str(e),
            meta={"credit_outcome": "unknown"},
        )
        raise HTTPException(status_code=500, detail=str(e))
