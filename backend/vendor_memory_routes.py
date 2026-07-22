"""Phase D — learn vendor corrections from CA edits after scan."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils import get_current_user, resolve_active_org_id
from validators import normalize_gstin
from vendor_memory import (
    VENDOR_MEMORY_ENABLED,
    deltas_from_snapshot,
    upsert_rules,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class LearnBody(BaseModel):
    vendor_gstin: str
    snapshot: dict[str, Any] = Field(default_factory=dict)
    final: dict[str, Any] = Field(default_factory=dict)


@router.post("/vendor-memory/learn")
async def learn_vendor_corrections(
    body: LearnBody,
    auth: dict = Depends(get_current_user),
):
    """
    Diff Extraction_Snapshot vs CA-edited final fields and upsert correction rules.
    Called from the scan save path (best-effort; never blocks invoice save).
    """
    if not VENDOR_MEMORY_ENABLED:
        return {"ok": True, "learned": 0, "disabled": True}

    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    org_id = await resolve_active_org_id(sc, user_id)
    if not org_id:
        raise HTTPException(status_code=400, detail="No active organization.")

    gstin = normalize_gstin(body.vendor_gstin) or normalize_gstin(
        body.final.get("Supplier_GSTIN")
    )
    if not gstin:
        return {"ok": True, "learned": 0, "reason": "no_vendor_gstin"}

    deltas = deltas_from_snapshot(body.snapshot, body.final)
    if not deltas:
        return {"ok": True, "learned": 0, "reason": "no_deltas"}

    n = await upsert_rules(sc, org_id=org_id, vendor_gstin=gstin, deltas=deltas)
    return {"ok": True, "learned": n, "fields": [d["field_name"] for d in deltas]}
