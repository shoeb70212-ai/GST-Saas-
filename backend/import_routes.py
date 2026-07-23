"""
Purchase-Register import API routes (Milestone 1 — reconcile without scanning).

POST /api/import/purchase-register/preview
    Upload a CSV/Excel purchase register → parse, auto-map columns, validate,
    dedupe against existing `invoices` for the client, and return per-row
    results + a summary. **No AI credits are spent** (deterministic parse only).

Commit is intentionally NOT implemented server-side: preview rows are injected
into the existing Verification Grid on the client and saved via the hardened
`save_invoice_atomic` RPC (see docs/milestone1-purchase-register-import.md §3.2,
Option 1). This reuses the entire auth/scoping/write path verbatim.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from import_service import (
    PREVIEW_ROW_CAP,
    compute_dedupe_key,
    purchase_register_df_to_invoices,
    read_purchase_register,
)
from utils import get_current_user, verify_client_access
from validators import normalize_gstin

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB, mirrors tally_routes / bank_routes
_ALLOWED_EXTS = (".csv", ".xlsx", ".xls")


async def _fetch_existing_keys(sc, client_id: str) -> set[str]:
    """Fetch existing (supplier_gstin|invoice_number) keys for app-level dedupe.

    Best-effort: on any failure we return an empty set (dedupe simply won't flag
    cross-file duplicates) rather than blocking the preview.
    """
    try:
        resp = await (
            sc.table("invoices")
            .select("supplier_gstin,invoice_number")
            .eq("client_id", client_id)
            .execute()
        )
        keys: set[str] = set()
        for row in resp.data or []:
            gstin = normalize_gstin(row.get("supplier_gstin") or "")
            inv_no = (row.get("invoice_number") or "").strip().lower()
            if gstin and inv_no:
                keys.add(compute_dedupe_key({
                    "supplier_gstin": gstin,
                    "invoice_number": inv_no,
                }))
        return keys
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("dedupe key fetch failed for client %s: %s", client_id, e)
        return set()


@router.post("/import/purchase-register/preview")
async def import_purchase_register_preview(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    mapping: Optional[str] = Form(None),
    period: Optional[str] = Form(None),  # reserved hint; recon sets recon_period
    auth: dict = Depends(get_current_user),
):
    """Parse + map + validate a purchase register. No DB write, no AI credits."""
    _ = period
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    filename = file.filename or "purchase-register.csv"
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. Upload Excel (.xlsx/.xls) or CSV. "
                "For Tally, export the Purchase Register as Excel/CSV."
            ),
        )

    try:
        df = read_purchase_register(content, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read spreadsheet: {e}")

    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file has no data rows.")

    user_mapping: dict[str, str] | None = None
    if mapping:
        try:
            parsed = json.loads(mapping)
            if isinstance(parsed, dict):
                user_mapping = {str(k): str(v) for k, v in parsed.items() if v}
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid mapping JSON.")

    existing_keys = await _fetch_existing_keys(sc, client_id)

    result = purchase_register_df_to_invoices(
        df, mapping=user_mapping, existing_keys=existing_keys
    )

    all_rows = result["rows"]
    return {
        "detected_doc_type": result["detected_doc_type"],
        "doc_type_confidence": result["doc_type_confidence"],
        "mapping": result["mapping"],
        "unmapped_required": result["unmapped_required"],
        "headers": result["headers"],
        "row_count": result["summary"]["total"],
        "preview_rows": all_rows[:PREVIEW_ROW_CAP],
        "truncated": len(all_rows) > PREVIEW_ROW_CAP,
        "summary": result["summary"],
    }
