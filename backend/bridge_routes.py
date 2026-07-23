"""
Tally Bridge API: device registration + export job queue.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import create_async_client

from bridge_auth import (
    create_device_token,
    generate_device_secret,
    hash_device_secret,
    job_fingerprint,
    verify_device_secret,
    verify_device_token,
)
from converter_service import apply_master_mappings
from tally_export import export_document, invoices_to_document
from tally_ir import InvoiceBatchExportRequest, TallyDocument
from utils import get_current_user, resolve_active_org_id, verify_client_access

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)

router = APIRouter()

MAX_XML_BYTES = 5 * 1024 * 1024


# ── Request bodies ────────────────────────────────────────────────────────────


class RegisterDeviceBody(BaseModel):
    label: str = "Bridge"
    client_id_allowlist: list[str] | None = None


class DeviceTokenBody(BaseModel):
    device_id: str
    device_secret: str


class RevokeDeviceBody(BaseModel):
    device_id: str


class CreateTallyJobBody(BaseModel):
    client_id: str
    source: str = "invoices"  # invoices | converter | document
    invoices: list[dict] | None = None
    line_items: list[dict] | None = None
    document: dict | None = None
    mappings: dict[str, str] = Field(default_factory=dict)
    auto_balance: bool = True
    include_masters: bool = True
    company_name: str | None = None
    default_voucher: str = "Purchase"


class JobResultBody(BaseModel):
    status: str  # pushed | failed
    tally_response: str | None = None
    error_message: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _service_client():
    return await create_async_client(SUPABASE_URL, SERVICE_ROLE)


async def _require_device(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bridge device token required")
    token = authorization.split(" ", 1)[1].strip()
    claims = verify_device_token(token)
    sc = await _service_client()
    resp = await sc.table("bridge_devices").select("*").eq("id", claims["sub"]).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=401, detail="Device not found")
    device = resp.data[0]
    if device.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Device revoked")
    if device.get("org_id") != claims.get("oid"):
        raise HTTPException(status_code=401, detail="Device org mismatch")
    await sc.table("bridge_devices").update(
        {"last_seen_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", device["id"]).execute()
    return {"claims": claims, "device": device, "sc": sc}


def _build_xml(body: CreateTallyJobBody) -> tuple[str, dict]:
    if body.source == "invoices":
        if not body.invoices:
            raise HTTPException(status_code=400, detail="invoices required for source=invoices")
        req = InvoiceBatchExportRequest.model_validate(
            {
                "invoices": body.invoices,
                "line_items": body.line_items or [],
                "auto_balance": body.auto_balance,
                "include_masters": body.include_masters,
                "default_voucher": body.default_voucher,
            }
        )
        doc = invoices_to_document(req)
        if body.company_name:
            doc.company_hint = body.company_name
        result = export_document(doc, auto_balance=body.auto_balance, include_masters=body.include_masters)
    elif body.source in ("converter", "document"):
        if not body.document:
            raise HTTPException(status_code=400, detail="document required")
        doc = TallyDocument.model_validate(body.document)
        if body.mappings:
            doc = apply_master_mappings(doc, body.mappings)
        if body.company_name:
            doc.company_hint = body.company_name
        result = export_document(doc, auto_balance=body.auto_balance, include_masters=body.include_masters)
    else:
        raise HTTPException(status_code=400, detail="Invalid source")

    xml = result.get("xml") or ""
    if not xml:
        raise HTTPException(status_code=400, detail="Export produced empty XML")
    if len(xml.encode("utf-8")) > MAX_XML_BYTES:
        raise HTTPException(status_code=413, detail="XML exceeds 5MB limit")

    report = result.get("report")
    voucher_count = None
    if report is not None:
        voucher_count = getattr(report, "voucher_count", None)
        if voucher_count is None and isinstance(report, dict):
            voucher_count = report.get("voucher_count")
    meta = {
        "voucher_count": voucher_count,
        "company_hint": body.company_name,
        "source": body.source,
        "warnings": result.get("warnings") or [],
    }
    return xml, meta


# ── User-facing device endpoints ──────────────────────────────────────────────


@router.post("/bridge/devices/register")
async def register_device(
    body: RegisterDeviceBody,
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    org_id = await resolve_active_org_id(sc, user_id)
    if not org_id:
        raise HTTPException(status_code=400, detail="No active organization")

    allowlist = body.client_id_allowlist
    if allowlist:
        for cid in allowlist:
            await verify_client_access(sc, cid)

    secret = generate_device_secret()
    secret_hash = hash_device_secret(secret)
    row = {
        "user_id": user_id,
        "org_id": org_id,
        "label": (body.label or "Bridge")[:120],
        "device_secret_hash": secret_hash,
        "client_id_allowlist": allowlist,
    }
    resp = await sc.table("bridge_devices").insert(row).execute()
    if not resp.data:
        raise HTTPException(status_code=502, detail="Failed to register device")
    device = resp.data[0]
    return {
        "status": "success",
        "device_id": device["id"],
        "device_secret": secret,
        "label": device["label"],
        "message": "Store device_secret securely; it will not be shown again.",
    }


@router.post("/bridge/devices/token")
async def device_token(body: DeviceTokenBody):
    sc = await _service_client()
    resp = await sc.table("bridge_devices").select("*").eq("id", body.device_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    device = resp.data[0]
    if device.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Device revoked")
    if not verify_device_secret(body.device_secret, device["device_secret_hash"]):
        raise HTTPException(status_code=401, detail="Invalid device credentials")

    token, exp = create_device_token(
        device_id=device["id"],
        user_id=device["user_id"],
        org_id=device["org_id"],
    )
    await sc.table("bridge_devices").update(
        {"last_seen_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", device["id"]).execute()
    return {"access_token": token, "token_type": "bearer", "expires_at": exp, "aud": "khatalens-bridge"}


@router.post("/bridge/devices/revoke")
async def revoke_device(
    body: RevokeDeviceBody,
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    # Owner can always revoke; org admin can revoke any in org
    device_resp = await sc.table("bridge_devices").select("*").eq("id", body.device_id).limit(1).execute()
    if not device_resp.data:
        raise HTTPException(status_code=404, detail="Device not found")
    device = device_resp.data[0]

    org_id = await resolve_active_org_id(sc, user_id)
    is_owner = device["user_id"] == user_id
    is_admin = False
    if org_id and device["org_id"] == org_id:
        mem = (
            await sc.table("organization_members")
            .select("role")
            .eq("org_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        role = (mem.data[0].get("role") if mem.data else "") or ""
        is_admin = role.lower() in ("owner", "admin")

    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed to revoke this device")

    await sc.table("bridge_devices").update(
        {"revoked_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", body.device_id).execute()
    return {"status": "success", "revoked": True}


@router.get("/bridge/devices")
async def list_devices(auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    resp = (
        await sc.table("bridge_devices")
        .select("id,label,org_id,client_id_allowlist,last_seen_at,revoked_at,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"status": "success", "devices": resp.data or []}


# ── Jobs ──────────────────────────────────────────────────────────────────────


@router.post("/tally/jobs")
async def create_tally_job(
    body: CreateTallyJobBody,
    auth: dict = Depends(get_current_user),
):
    sc = auth["supabase_client"]
    user_id = auth["user_id"]
    await verify_client_access(sc, body.client_id)
    org_id = await resolve_active_org_id(sc, user_id)
    if not org_id:
        raise HTTPException(status_code=400, detail="No active organization")

    xml, meta = _build_xml(body)
    fp = job_fingerprint(client_id=body.client_id, xml=xml, source=body.source)

    # Idempotent: return existing non-failed job with same fingerprint
    existing = (
        await sc.table("tally_export_jobs")
        .select("id,status,fingerprint,created_at,completed_at")
        .eq("client_id", body.client_id)
        .eq("fingerprint", fp)
        .in_("status", ["queued", "claimed", "pushed"])
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        return {
            "status": "success",
            "job_id": row["id"],
            "job_status": row["status"],
            "fingerprint": fp,
            "xml": xml if row["status"] != "pushed" else None,
            "idempotent": True,
            "message": "Existing job returned for same fingerprint",
        }

    insert = {
        "org_id": org_id,
        "user_id": user_id,
        "client_id": body.client_id,
        "source": body.source,
        "status": "queued",
        "xml": xml,
        "payload_meta": meta,
        "fingerprint": fp,
    }
    try:
        resp = await sc.table("tally_export_jobs").insert(insert).execute()
    except Exception as e:
        # Race on unique fingerprint
        logger.warning("tally job insert conflict: %s", e)
        existing2 = (
            await sc.table("tally_export_jobs")
            .select("id,status")
            .eq("client_id", body.client_id)
            .eq("fingerprint", fp)
            .limit(1)
            .execute()
        )
        if existing2.data:
            return {
                "status": "success",
                "job_id": existing2.data[0]["id"],
                "job_status": existing2.data[0]["status"],
                "fingerprint": fp,
                "xml": xml,
                "idempotent": True,
            }
        raise HTTPException(status_code=502, detail="Failed to enqueue Tally job") from e

    if not resp.data:
        raise HTTPException(status_code=502, detail="Failed to enqueue Tally job")
    job = resp.data[0]
    return {
        "status": "success",
        "job_id": job["id"],
        "job_status": "queued",
        "fingerprint": fp,
        "xml": xml,
        "idempotent": False,
        "payload_meta": meta,
    }


@router.get("/tally/jobs/{job_id}")
async def get_tally_job(job_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    resp = (
        await sc.table("tally_export_jobs")
        .select("id,client_id,source,status,payload_meta,fingerprint,error_message,created_at,completed_at")
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = resp.data[0]
    await verify_client_access(sc, job["client_id"])
    return {"status": "success", "job": job}


@router.get("/bridge/jobs/next")
async def claim_next_job(device_ctx: dict = Depends(_require_device)):
    device = device_ctx["device"]
    sc = device_ctx["sc"]
    allowlist = device.get("client_id_allowlist")
    rpc = await sc.rpc(
        "claim_tally_export_job",
        {
            "device_id_param": device["id"],
            "org_id_param": device["org_id"],
            "allowlist": allowlist,
        },
    ).execute()
    rows = rpc.data or []
    if not rows:
        return {"status": "success", "job": None}
    job = rows[0] if isinstance(rows, list) else rows
    return {
        "status": "success",
        "job": {
            "id": job["id"],
            "client_id": job["client_id"],
            "source": job["source"],
            "xml": job["xml"],
            "payload_meta": job.get("payload_meta"),
            "fingerprint": job.get("fingerprint"),
        },
    }


@router.post("/bridge/jobs/{job_id}/result")
async def report_job_result(
    job_id: str,
    body: JobResultBody,
    device_ctx: dict = Depends(_require_device),
):
    if body.status not in ("pushed", "failed"):
        raise HTTPException(status_code=400, detail="status must be pushed|failed")
    device = device_ctx["device"]
    sc = device_ctx["sc"]
    resp = await sc.table("tally_export_jobs").select("*").eq("id", job_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = resp.data[0]
    if job.get("claimed_by_device_id") and job["claimed_by_device_id"] != device["id"]:
        raise HTTPException(status_code=403, detail="Job claimed by another device")
    if job["org_id"] != device["org_id"]:
        raise HTTPException(status_code=403, detail="Org mismatch")

    patch = {
        "status": body.status,
        "tally_response": (body.tally_response or "")[:20000],
        "error_message": body.error_message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "claimed_by_device_id": device["id"],
    }
    await sc.table("tally_export_jobs").update(patch).eq("id", job_id).execute()
    return {"status": "success", "job_id": job_id, "job_status": body.status}
