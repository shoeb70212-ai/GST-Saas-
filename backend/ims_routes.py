"""IMS Accept/Reject/Pending cockpit API (JSON upload MVP — no GSP)."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from http_client import get_shared_client
from ims import (
    extract_invoice_list,
    normalize_ims_row,
    summarize_ims,
    sync_ims_status_updates,
)
from utils import get_current_user, verify_client_access

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

router = APIRouter()


class BulkActionBody(BaseModel):
    client_id: str
    period: str
    ids: list[str] = Field(default_factory=list)
    action: str
    reason: str | None = None


def _headers(token: str) -> dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY or "",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def _sync_pr_ims_status(
    http_client,
    *,
    token: str,
    client_id: str,
    period: str,
    ims_rows: list[dict],
) -> int:
    headers = _headers(token)
    inv_url = (
        f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}"
        f"&recon_period=eq.{period}"
        f"&select=id,supplier_gstin,invoice_number,ims_status"
    )
    resp = await http_client.get(inv_url, headers=headers)
    if resp.status_code != 200:
        return 0
    invoices = resp.json() if isinstance(resp.json(), list) else []
    patches = sync_ims_status_updates(invoices, ims_rows)
    for p in patches:
        await http_client.patch(
            f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{p['id']}",
            headers={**headers, "Prefer": "return=minimal"},
            json={"ims_status": p["ims_status"]},
        )
    try:
        from itc_risk import recompute_itc_risk

        await recompute_itc_risk(
            http_client, token=token, client_id=client_id, period=period
        )
    except Exception as e:
        logger.warning("ITC recompute after IMS sync failed: %s", e)
    return len(patches)


@router.post("/ims/upload")
async def upload_ims_json(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period: str = Form(...),
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)
    user_id = auth["user_id"]
    token = auth["token"]

    raw_bytes = await file.read()
    try:
        payload = json.loads(raw_bytes.decode("utf-8-sig"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}") from e

    items = extract_invoice_list(payload)
    if not items:
        raise HTTPException(status_code=400, detail="No invoice rows found in IMS JSON")

    rows: list[dict] = []
    for item in items:
        norm = normalize_ims_row(item, period=period, user_id=user_id, client_id=client_id)
        if norm:
            rows.append(norm)

    if not rows:
        raise HTTPException(status_code=400, detail="No usable IMS invoice rows after normalize")

    # Dedupe by unique key within file
    by_key: dict[tuple, dict] = {}
    for r in rows:
        key = (r["client_id"], r["period"], r["supplier_gstin"], r["invoice_number"])
        by_key[key] = r
    rows = list(by_key.values())

    async with get_shared_client() as http_client:
        headers = _headers(token)
        # Replace period: delete then insert (simpler than upsert conflict for MVP)
        del_resp = await http_client.delete(
            f"{SUPABASE_URL}/rest/v1/ims_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={**headers, "Prefer": "return=minimal"},
        )
        if del_resp.status_code not in (200, 204):
            logger.warning("IMS delete period failed: %s", del_resp.status_code)

        chunk = 200
        inserted = 0
        for i in range(0, len(rows), chunk):
            part = rows[i : i + chunk]
            post = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/ims_records",
                headers=headers,
                json=part,
            )
            if post.status_code not in (200, 201):
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to save IMS records: {post.text[:300]}",
                )
            inserted += len(part)

        await _sync_pr_ims_status(
            http_client,
            token=token,
            client_id=client_id,
            period=period,
            ims_rows=rows,
        )

    summary = summarize_ims(rows)
    return {
        "status": "success",
        "engine": "rules",
        "message": f"Loaded {inserted} IMS records for {period}.",
        "counts": summary["counts"],
        "deemed_soon": summary["deemed_soon"],
        "total": inserted,
    }


@router.get("/ims")
async def list_ims(
    client_id: str = Query(...),
    period: str = Query(...),
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)
    token = auth["token"]

    async with get_shared_client() as http_client:
        resp = await http_client.get(
            (
                f"{SUPABASE_URL}/rest/v1/ims_records?client_id=eq.{client_id}"
                f"&period=eq.{period}&select=*&order=deemed_accept_by.asc.nullslast"
            ),
            headers=_headers(token),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load IMS records")
        rows = resp.json() if isinstance(resp.json(), list) else []

    summary = summarize_ims(rows)
    return {
        "status": "success",
        "client_id": client_id,
        "period": period,
        **summary,
    }


@router.post("/ims/bulk-action")
async def bulk_ims_action(
    body: BulkActionBody,
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    await verify_client_access(sc, body.client_id)
    token = auth["token"]

    action = (body.action or "").strip().lower()
    if action not in ("pending", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="action must be pending|accepted|rejected")
    if not body.ids:
        raise HTTPException(status_code=400, detail="ids required")

    from ims import deemed_accept_by

    patch: dict[str, Any] = {
        "ims_action": action,
        "action_reason": body.reason,
        "deemed_accept_by": deemed_accept_by(body.period) if action == "pending" else None,
    }

    async with get_shared_client() as http_client:
        headers = _headers(token)
        updated = 0
        # PostgREST in.() for uuid list
        id_list = ",".join(body.ids)
        resp = await http_client.patch(
            (
                f"{SUPABASE_URL}/rest/v1/ims_records?client_id=eq.{body.client_id}"
                f"&period=eq.{body.period}&id=in.({id_list})"
            ),
            headers=headers,
            json=patch,
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail="Bulk action failed")
        data = resp.json() if resp.status_code == 200 else []
        updated = len(data) if isinstance(data, list) else len(body.ids)

        list_resp = await http_client.get(
            (
                f"{SUPABASE_URL}/rest/v1/ims_records?client_id=eq.{body.client_id}"
                f"&period=eq.{body.period}&select=*"
            ),
            headers=headers,
        )
        ims_rows = list_resp.json() if list_resp.status_code == 200 else []
        await _sync_pr_ims_status(
            http_client,
            token=token,
            client_id=body.client_id,
            period=body.period,
            ims_rows=ims_rows if isinstance(ims_rows, list) else [],
        )

    return {
        "status": "success",
        "updated": updated,
        "action": action,
    }
