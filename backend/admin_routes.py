import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request
from supabase import create_async_client
from pydantic import BaseModel, Field

from utils import get_current_user, resolve_active_org_id
from admin_metrics import (
    health_summary,
    health_credits,
    health_ai,
    health_gstin,
    health_funnel,
    health_channels,
    health_quality,
    refund_status_from_meta,
)
import ops_alerts

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


async def _admin_client():
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
        )
    return await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def write_admin_audit(
    admin_client,
    *,
    admin_user_id: str,
    action: str,
    target_org_id: str | None = None,
    target_user_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    note: str | None = None,
) -> None:
    try:
        await admin_client.table("admin_audit_log").insert(
            {
                "admin_user_id": admin_user_id,
                "action": action,
                "target_org_id": target_org_id,
                "target_user_id": target_user_id,
                "before_json": before or {},
                "after_json": after or {},
                "note": (note or "")[:2000] or None,
            }
        ).execute()
    except Exception as e:
        logger.warning("admin_audit_log write failed: %s", e)


async def verify_super_admin(auth: dict = Depends(get_current_user)):
    """
    Compose on get_current_user, then require profiles.is_super_admin.
    Returns the auth dict (user_id, supabase_client, token).
    """
    user_id = auth["user_id"]
    sc = auth["supabase_client"]

    try:
        profile_resp = await sc.table("profiles").select("is_super_admin").eq("id", user_id).execute()

        if not profile_resp.data:
            raise HTTPException(status_code=403, detail="Forbidden: Profile not found")

        is_admin = profile_resp.data[0].get("is_super_admin", False)
        if not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not a Super Admin.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin verification error: {e}")
        raise HTTPException(status_code=500, detail="Error verifying admin status")

    return auth


@router.get("/metrics")
async def get_admin_metrics(auth: dict = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch metrics.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Get total invoices
    inv_resp = await admin_client.table("invoices").select("id", count="exact").execute()
    total_invoices = inv_resp.count if inv_resp.count else 0

    # Get total active clients (distinct client_ids)
    client_resp = await admin_client.table("clients").select("id", count="exact").execute()
    total_clients = client_resp.count if client_resp.count else 0

    # Get all tenants (CA firms / users)
    tenants_resp = await admin_client.table("profiles").select("id", count="exact").execute()
    total_tenants = tenants_resp.count if tenants_resp.count else 0

    # Prefer token-based cost when ops data exists
    ai_tokens_24h = 0
    estimated_from_ops = None
    try:
        ai = await health_ai(admin_client, "24h")
        ai_tokens_24h = int(ai.get("tokens_total") or 0)
        if ai_tokens_24h > 0:
            estimated_from_ops = ai.get("estimated_cost_inr")
    except Exception as e:
        logger.warning("metrics AI enrichment failed: %s", e)

    fallback_cost = round(total_invoices * 0.065, 2)
    return {
        "metrics": {
            "total_invoices": total_invoices,
            "estimated_cost_inr": estimated_from_ops if estimated_from_ops is not None else fallback_cost,
            "estimated_cost_source": "ops_tokens" if estimated_from_ops is not None else "invoice_fallback",
            "ai_tokens_24h": ai_tokens_24h,
            "active_tenants": total_tenants,
            "total_clients": total_clients
        }
    }


class QuotaUpdate(BaseModel):
    user_id: str
    new_quota: int


@router.post("/tenants/{tenant_id}/update")
async def update_tenant_quota(tenant_id: str, data: QuotaUpdate, auth: dict = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update quotas.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Org wallet is authoritative (profiles.credits dropped in phase 54)
    org_id = await resolve_active_org_id(admin_client, tenant_id)
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")

    resp = await admin_client.table("organizations").update({"credits": data.new_quota}).eq("id", org_id).execute()

    # Check for error instead of empty data (Supabase updates can return empty data on success)
    if hasattr(resp, 'error') and resp.error:
        raise HTTPException(status_code=400, detail=f"Failed to update tenant quota: {resp.error}")

    return {"status": "success", "message": f"Quota updated to {data.new_quota}"}


def _is_test_tenant(company_name: str | None, email: str | None) -> bool:
    """Heuristic for E2E / fixture tenants that flood admin lists."""
    email_l = (email or "").lower()
    company_l = (company_name or "").lower()
    if "khatalens-test.com" in email_l:
        return True
    if "khatalens-test" in company_l:
        return True
    return False


def _sanitize_search_term(raw: str) -> str:
    """Strip PostgREST filter metacharacters from free-text search."""
    return "".join(ch for ch in raw.strip() if ch not in ",.()\"'\\").strip()[:120]


@router.get("/tenants")
async def get_all_tenants(
    auth: dict = Depends(verify_super_admin),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, description="Search company name or email"),
    exclude_test: bool = Query(False, description="Hide KhataLens-test / khatalens-test.com tenants"),
):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch tenants.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    search = _sanitize_search_term(q) if q else ""

    # Auth emails first — needed for email search + test-tenant filtering
    user_emails: dict[str, str] = {}
    try:
        page = 1
        per_page = 1000
        while True:
            try:
                auth_users = await admin_client.auth.admin.list_users(page=page, per_page=per_page)
            except TypeError:
                if page > 1:
                    break
                auth_users = await admin_client.auth.admin.list_users()

            users_list = []
            if isinstance(auth_users, list):
                users_list = auth_users
            elif auth_users and hasattr(auth_users, "users"):
                users_list = auth_users.users

            if not users_list:
                break

            for u in users_list:
                user_emails[u.id] = u.email

            if len(users_list) < per_page:
                break

            page += 1
            if page > 20:
                break
    except Exception as e:
        logger.warning(f"Could not fetch auth users: {e}")

    email_match_ids: list[str] = []
    if search:
        sl = search.lower()
        email_match_ids = [
            uid for uid, email in user_emails.items()
            if email and sl in str(email).lower()
        ][:200]

    # Over-fetch when exclude_test so post-filter still fills a page of real tenants
    fetch_limit = min(limit * 5, 200) if exclude_test else limit

    # 1. Paginated profiles (newest first)
    profiles_query = (
        admin_client.table("profiles")
        .select("id, company_name, active_org_id, created_at", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + fetch_limit - 1)
    )
    if search:
        if email_match_ids:
            ids_csv = ",".join(email_match_ids)
            profiles_query = profiles_query.or_(
                f"company_name.ilike.%{search}%,id.in.({ids_csv})"
            )
        else:
            profiles_query = profiles_query.ilike("company_name", f"%{search}%")
    if exclude_test:
        try:
            profiles_query = profiles_query.not_.ilike("company_name", "%KhataLens-test%")
        except Exception as e:
            logger.warning(f"exclude_test company filter unavailable: {e}")

    profiles_resp = await profiles_query.execute()
    profiles = profiles_resp.data if profiles_resp.data else []
    total = profiles_resp.count if profiles_resp.count is not None else len(profiles)

    # 2. Org wallet credits for this page
    org_ids = [p.get("active_org_id") for p in profiles if p.get("active_org_id")]
    credits_map: dict[str, int] = {}
    suspend_map: dict[str, dict] = {}
    if org_ids:
        try:
            orgs_resp = await admin_client.table("organizations").select(
                "id, credits, suspended_at, suspend_reason, name"
            ).in_("id", org_ids).execute()
            for row in orgs_resp.data or []:
                credits_map[row["id"]] = int(row.get("credits") or 0)
                suspend_map[row["id"]] = {
                    "suspended_at": row.get("suspended_at"),
                    "suspend_reason": row.get("suspend_reason"),
                    "org_name": row.get("name"),
                }
        except Exception as e:
            logger.warning(f"Could not fetch org credits for tenant page: {e}")

    # Resolve missing active_org_id via membership helper (bounded to page size)
    for profile in profiles:
        uid = profile.get("id")
        org_id = profile.get("active_org_id")
        if org_id and org_id in credits_map:
            continue
        try:
            resolved = await resolve_active_org_id(admin_client, uid)
            if resolved:
                profile["active_org_id"] = resolved
                if resolved not in credits_map:
                    org_resp = await admin_client.table("organizations").select("credits").eq("id", resolved).execute()
                    if org_resp.data:
                        credits_map[resolved] = int(org_resp.data[0].get("credits") or 0)
        except Exception as e:
            logger.warning(f"Could not resolve org for tenant {uid}: {e}")

    # 3. Usage counts via materialized view (avoids loading all invoices)
    usage_map = {}
    try:
        usage_resp = await admin_client.table("tenant_usage").select("user_id, invoice_count").execute()
        if usage_resp.data:
            for row in usage_resp.data:
                uid = row.get("user_id")
                if uid:
                    usage_map[uid] = row.get("invoice_count", 0)
    except Exception as e:
        logger.warning(f"tenant_usage view not available, falling back to direct query: {e}")
        page_ids = [p.get("id") for p in profiles if p.get("id")]
        if page_ids:
            invoices_resp = await admin_client.table("invoices").select("user_id").in_("user_id", page_ids).execute()
            for inv in invoices_resp.data or []:
                uid = inv.get("user_id")
                if uid:
                    usage_map[uid] = usage_map.get(uid, 0) + 1

    # 4. Clients managed — scoped to page user_ids
    clients_map = {}
    page_ids = [p.get("id") for p in profiles if p.get("id")]
    if page_ids:
        try:
            clients_resp = await admin_client.table("clients").select("user_id").in_("user_id", page_ids).execute()
            for c in clients_resp.data or []:
                uid = c.get("user_id")
                if uid:
                    clients_map[uid] = clients_map.get(uid, 0) + 1
        except Exception as e:
            logger.warning(f"Could not fetch clients for tenant page: {e}")

    # 5. Build + post-filter (email test domains / email search refine)
    tenants = []
    for profile in profiles:
        uid = profile.get("id")
        email = user_emails.get(uid, "Unknown Email")
        company = profile.get("company_name")
        if not company or not str(company).strip():
            if "@" in email:
                domain = email.split("@")[1].split(".")[0]
                company = domain.capitalize() + " Firm"
            else:
                company = "Unknown Company"

        if exclude_test and _is_test_tenant(company, email):
            continue
        if search:
            sl = search.lower()
            if sl not in str(company).lower() and sl not in str(email).lower():
                continue

        org_id = profile.get("active_org_id")
        sus = suspend_map.get(org_id or "", {})
        tenants.append({
            "id": uid,
            "company_name": company,
            "email": email,
            "credits": credits_map.get(org_id, 0) if org_id else 0,
            "created_at": profile.get("created_at"),
            "invoices_processed": usage_map.get(uid, 0),
            "clients_managed": clients_map.get(uid, 0),
            "suspended_at": sus.get("suspended_at"),
            "suspend_reason": sus.get("suspend_reason"),
            "org_id": org_id,
        })

    page_tenants = tenants[:limit]
    raw_fetched = len(profiles)
    has_more = (offset + raw_fetched) < total if raw_fetched else False
    if exclude_test and len(tenants) > limit:
        has_more = True

    return {
        "status": "success",
        "tenants": page_tenants,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": has_more,
            "q": search or None,
            "exclude_test": exclude_test,
        },
    }


class ProfileUpdate(BaseModel):
    company_name: str


@router.post("/tenants/{tenant_id}/profile")
async def update_tenant_profile(tenant_id: str, data: ProfileUpdate, auth: dict = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update profile.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    resp = await admin_client.table("profiles").update({"company_name": data.company_name}).eq("id", tenant_id).execute()

    if hasattr(resp, 'error') and resp.error:
        raise HTTPException(status_code=400, detail=f"Failed to update tenant profile: {resp.error}")

    return {"status": "success", "message": "Profile updated successfully."}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, auth: dict = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot delete tenant.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    try:
        await admin_client.auth.admin.delete_user(tenant_id)
        logger.info(f"Tenant {tenant_id} deleted by admin {auth.get('user_id', 'unknown')}")
        return {"status": "success", "message": "Tenant account deleted permanently."}
    except Exception as e:
        logger.error(f"Failed to delete tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete tenant: {str(e)}")


@router.get("/ops-events")
async def list_ops_events(
    auth: dict = Depends(verify_super_admin),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    severity: str | None = Query(None, description="error|warning|info"),
    channel: str | None = Query(None, description="scan|batch|public|whatsapp"),
    event_type: str | None = Query(None),
    resolved: str | None = Query("all", description="open|resolved|all"),
    org_id: str | None = Query(None),
):
    """
    Recent extraction/scan ops events for platform operators.
    Service-role read of ops_events (no tenant RLS policies).
    """
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch ops events.",
        )

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    query = (
        admin_client.table("ops_events")
        .select("*", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if severity:
        query = query.eq("severity", severity.strip().lower())
    if channel:
        query = query.eq("channel", channel.strip().lower())
    if event_type:
        query = query.eq("event_type", event_type.strip())
    if org_id:
        query = query.eq("org_id", org_id.strip())

    resolved_mode = (resolved or "all").strip().lower()
    if resolved_mode == "open":
        query = query.is_("resolved_at", "null")
    elif resolved_mode == "resolved":
        query = query.not_.is_("resolved_at", "null")

    try:
        resp = await query.execute()
    except Exception as e:
        logger.error("Failed to list ops_events: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load ops events")

    events = resp.data if resp.data else []
    total = resp.count if resp.count is not None else len(events)

    return {
        "status": "success",
        "events": events,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": (offset + len(events)) < total,
            "resolved": resolved_mode,
        },
    }


class ResolveOpsEventBody(BaseModel):
    note: str | None = Field(None, max_length=1000)


async def _enrich_ops_event(admin_client, event: dict) -> dict:
    org_id = event.get("org_id")
    user_id = event.get("user_id")
    org_name = None
    company_name = None
    owner_email = None

    if org_id:
        try:
            org_resp = (
                await admin_client.table("organizations")
                .select("id, name, owner_id")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            if org_resp.data:
                org_name = org_resp.data[0].get("name")
                if not user_id:
                    user_id = org_resp.data[0].get("owner_id")
        except Exception as e:
            logger.warning("ops enrich org failed: %s", e)

    if user_id:
        try:
            prof = (
                await admin_client.table("profiles")
                .select("id, company_name")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                company_name = prof.data[0].get("company_name")
        except Exception as e:
            logger.warning("ops enrich profile failed: %s", e)
        try:
            auth_user = await admin_client.auth.admin.get_user_by_id(user_id)
            user_obj = getattr(auth_user, "user", auth_user)
            owner_email = getattr(user_obj, "email", None)
        except Exception:
            pass

    meta = event.get("meta") if isinstance(event.get("meta"), dict) else {}
    return {
        **event,
        "org_name": org_name or company_name or ("Unknown firm" if not org_id else org_name),
        "company_name": company_name,
        "owner_email": owner_email,
        "refund_status": refund_status_from_meta(meta),
    }


@router.get("/ops-events/{event_id}")
async def get_ops_event(event_id: str, auth: dict = Depends(verify_super_admin)):
    admin_client = await _admin_client()
    try:
        resp = (
            await admin_client.table("ops_events")
            .select("*")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error("get ops event failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load ops event")
    if not resp.data:
        raise HTTPException(status_code=404, detail="Ops event not found")
    enriched = await _enrich_ops_event(admin_client, resp.data[0])
    return {"status": "success", "event": enriched}


@router.post("/ops-events/{event_id}/resolve")
async def resolve_ops_event(
    event_id: str,
    body: ResolveOpsEventBody,
    auth: dict = Depends(verify_super_admin),
):
    admin_client = await _admin_client()
    note = (body.note or "").strip()
    if len(note) > 1000:
        raise HTTPException(status_code=400, detail="resolution note max 1000 chars")

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "resolved_at": now_iso,
        "resolved_by": auth["user_id"],
        "resolution_note": note or None,
    }
    try:
        resp = (
            await admin_client.table("ops_events")
            .update(payload)
            .eq("id", event_id)
            .execute()
        )
    except Exception as e:
        logger.error("resolve ops event failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to resolve ops event")

    if not resp.data:
        # Some PostgREST configs return empty; verify existence
        check = (
            await admin_client.table("ops_events")
            .select("id")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Ops event not found")

    await write_admin_audit(
        admin_client,
        admin_user_id=auth["user_id"],
        action="ops_resolve",
        note=note or None,
        after={"event_id": event_id, **payload},
    )
    return {"status": "success", "event_id": event_id, "resolved_at": now_iso}


@router.post("/ops-events/{event_id}/reopen")
async def reopen_ops_event(event_id: str, auth: dict = Depends(verify_super_admin)):
    admin_client = await _admin_client()
    payload = {
        "resolved_at": None,
        "resolved_by": None,
        "resolution_note": None,
    }
    try:
        resp = (
            await admin_client.table("ops_events")
            .update(payload)
            .eq("id", event_id)
            .execute()
        )
    except Exception as e:
        logger.error("reopen ops event failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to reopen ops event")

    check = (
        await admin_client.table("ops_events")
        .select("id")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    if not check.data and not (resp.data if resp else None):
        raise HTTPException(status_code=404, detail="Ops event not found")

    await write_admin_audit(
        admin_client,
        admin_user_id=auth["user_id"],
        action="ops_reopen",
        after={"event_id": event_id},
    )
    return {"status": "success", "event_id": event_id, "resolved_at": None}


# ─── Health aggregations (P1) ───────────────────────────────────────────────


@router.get("/health-summary")
async def get_health_summary(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", "health": await health_summary(admin_client, window)}


@router.get("/health/credits")
async def get_health_credits(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_credits(admin_client, window)}


@router.get("/health/ai")
async def get_health_ai(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_ai(admin_client, window)}


@router.get("/health/gstin")
async def get_health_gstin(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_gstin(admin_client, window)}


@router.get("/health/funnel")
async def get_health_funnel(
    auth: dict = Depends(verify_super_admin),
    days: int = Query(7, ge=1, le=30),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_funnel(admin_client, days)}


@router.get("/health/channels")
async def get_health_channels(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_channels(admin_client, window)}


@router.get("/health/quality")
async def get_health_quality(
    auth: dict = Depends(verify_super_admin),
    window: str = Query("24h"),
):
    admin_client = await _admin_client()
    return {"status": "success", **await health_quality(admin_client, window)}


# ─── Tenant tooling (P2) ────────────────────────────────────────────────────


class CreditAdjustBody(BaseModel):
    delta: int
    note: str = Field(..., min_length=5, max_length=500)


class SuspendBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=40)
    note: str = Field(..., min_length=3, max_length=1000)


class UnsuspendBody(BaseModel):
    note: str = Field(..., min_length=3, max_length=1000)


class BulkArchiveTestsBody(BaseModel):
    confirm: str
    dry_run: bool = True


@router.post("/tenants/{tenant_id}/credits")
async def adjust_tenant_credits(
    tenant_id: str,
    body: CreditAdjustBody,
    auth: dict = Depends(verify_super_admin),
):
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="delta must be non-zero")
    admin_client = await _admin_client()
    org_id = await resolve_active_org_id(admin_client, tenant_id)
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")

    try:
        rpc = await admin_client.rpc(
            "admin_adjust_org_credits",
            {
                "org_id_param": org_id,
                "delta_param": body.delta,
                "admin_id_param": auth["user_id"],
                "note_param": body.note.strip(),
                "allow_negative": False,
            },
        ).execute()
    except Exception as e:
        logger.error("credit adjust RPC failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Credit adjust failed: {e}")

    new_balance = rpc.data
    return {
        "status": "success",
        "org_id": org_id,
        "credits": new_balance,
        "delta": body.delta,
    }


@router.get("/tenants/{tenant_id}/credit-audit")
async def tenant_credit_audit(
    tenant_id: str,
    auth: dict = Depends(verify_super_admin),
    limit: int = Query(40, ge=1, le=200),
):
    admin_client = await _admin_client()
    org_id = await resolve_active_org_id(admin_client, tenant_id)
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")
    try:
        resp = (
            await admin_client.table("admin_audit_log")
            .select("*")
            .eq("target_org_id", org_id)
            .eq("action", "credit_adjust")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.error("credit audit failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load credit audit")
    return {"status": "success", "org_id": org_id, "entries": resp.data or []}


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: str,
    body: SuspendBody,
    auth: dict = Depends(verify_super_admin),
):
    if body.reason not in ("nonpayment", "abuse", "request", "other"):
        raise HTTPException(status_code=400, detail="Invalid suspend reason")
    admin_client = await _admin_client()
    org_id = await resolve_active_org_id(admin_client, tenant_id)
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")

    before = {}
    try:
        prev = (
            await admin_client.table("organizations")
            .select("credits, suspended_at, suspend_reason")
            .eq("id", org_id)
            .limit(1)
            .execute()
        )
        if prev.data:
            before = prev.data[0]
    except Exception:
        pass

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "suspended_at": now_iso,
        "suspended_by": auth["user_id"],
        "suspend_reason": body.reason,
        "suspend_note": body.note.strip(),
    }
    await admin_client.table("organizations").update(payload).eq("id", org_id).execute()
    await write_admin_audit(
        admin_client,
        admin_user_id=auth["user_id"],
        action="suspend",
        target_org_id=org_id,
        target_user_id=tenant_id,
        before=before,
        after=payload,
        note=body.note.strip(),
    )
    return {"status": "success", "org_id": org_id, "suspended_at": now_iso}


@router.post("/tenants/{tenant_id}/unsuspend")
async def unsuspend_tenant(
    tenant_id: str,
    body: UnsuspendBody,
    auth: dict = Depends(verify_super_admin),
):
    admin_client = await _admin_client()
    org_id = await resolve_active_org_id(admin_client, tenant_id)
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")

    payload = {
        "suspended_at": None,
        "suspended_by": None,
        "suspend_reason": None,
        "suspend_note": None,
    }
    await admin_client.table("organizations").update(payload).eq("id", org_id).execute()
    await write_admin_audit(
        admin_client,
        admin_user_id=auth["user_id"],
        action="unsuspend",
        target_org_id=org_id,
        target_user_id=tenant_id,
        note=body.note.strip(),
    )
    return {"status": "success", "org_id": org_id}


@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate_tenant(tenant_id: str, auth: dict = Depends(verify_super_admin)):
    """
    Read-only support session: magic link for the tenant user.
    Never impersonate another super-admin.
    """
    admin_client = await _admin_client()

    # Block impersonating other super-admins
    try:
        prof = (
            await admin_client.table("profiles")
            .select("id, is_super_admin, company_name")
            .eq("id", tenant_id)
            .limit(1)
            .execute()
        )
        if not prof.data:
            raise HTTPException(status_code=404, detail="Tenant not found")
        if prof.data[0].get("is_super_admin"):
            raise HTTPException(status_code=403, detail="Cannot impersonate another super-admin")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        auth_user = await admin_client.auth.admin.get_user_by_id(tenant_id)
        user_obj = getattr(auth_user, "user", auth_user)
        email = getattr(user_obj, "email", None)
        if not email:
            raise HTTPException(status_code=400, detail="Tenant has no email")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load tenant auth user: {e}")

    try:
        link_resp = await admin_client.auth.admin.generate_link(
            {"type": "magiclink", "email": email}
        )
        props = getattr(link_resp, "properties", None) or getattr(link_resp, "data", None)
        action_link = None
        if props is not None:
            action_link = getattr(props, "action_link", None)
            if action_link is None and isinstance(props, dict):
                action_link = props.get("action_link")
        if not action_link and isinstance(link_resp, dict):
            action_link = (
                link_resp.get("properties", {}) or {}
            ).get("action_link") or (link_resp.get("action_link"))
    except Exception as e:
        logger.error("generate_link failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate support magic link")

    if not action_link:
        raise HTTPException(status_code=500, detail="Magic link missing from auth response")

    await write_admin_audit(
        admin_client,
        admin_user_id=auth["user_id"],
        action="impersonate_start",
        target_user_id=tenant_id,
        note="read-only support session (magic link)",
        after={"email_domain": email.split("@")[-1] if "@" in email else None},
    )

    # Frontend should open support-enter which sets localStorage then redirects
    frontend = (os.getenv("PUBLIC_APP_URL") or os.getenv("VITE_APP_URL") or "").rstrip("/")
    support_url = None
    if frontend:
        from urllib.parse import quote

        support_url = f"{frontend}/app/support-enter?redirect={quote(action_link, safe='')}"

    return {
        "status": "success",
        "mode": "read_only",
        "action_link": action_link,
        "support_enter_url": support_url,
        "expires_hint_minutes": 15,
    }


@router.post("/tenants/bulk-archive-tests")
async def bulk_archive_test_firms(
    body: BulkArchiveTestsBody,
    auth: dict = Depends(verify_super_admin),
):
    if body.confirm != "DELETE_TEST_FIRMS":
        raise HTTPException(
            status_code=400,
            detail='confirm must equal "DELETE_TEST_FIRMS"',
        )
    admin_client = await _admin_client()

    # Collect candidate profiles with test naming
    try:
        profiles_resp = (
            await admin_client.table("profiles")
            .select("id, company_name, active_org_id")
            .ilike("company_name", "%KhataLens-test%")
            .limit(50)
            .execute()
        )
        candidates = list(profiles_resp.data or [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Email domain check via auth list (bounded)
    user_emails: dict[str, str] = {}
    try:
        auth_users = await admin_client.auth.admin.list_users(page=1, per_page=1000)
        users_list = auth_users if isinstance(auth_users, list) else getattr(auth_users, "users", []) or []
        for u in users_list:
            user_emails[u.id] = u.email or ""
    except Exception as e:
        logger.warning("bulk archive email fetch: %s", e)

    approved: list[dict] = []
    for p in candidates:
        email = user_emails.get(p["id"], "")
        company = p.get("company_name") or ""
        if not _is_test_tenant(company, email):
            # Hard deny non-test even if company matched loosely
            continue
        # Extra: require test email domain OR company pattern
        email_ok = "khatalens-test.com" in email.lower()
        company_ok = "khatalens-test" in company.lower()
        if not (email_ok or company_ok):
            continue
        if email and "khatalens-test.com" not in email.lower() and not company_ok:
            continue
        approved.append(
            {
                "user_id": p["id"],
                "company_name": company,
                "email": email or None,
                "org_id": p.get("active_org_id"),
            }
        )
        if len(approved) >= 50:
            break

    if body.dry_run:
        return {
            "status": "success",
            "dry_run": True,
            "count": len(approved),
            "candidates": approved,
        }

    archived = []
    for row in approved:
        org_id = row.get("org_id")
        if org_id:
            try:
                await (
                    admin_client.table("organizations")
                    .update({"is_test_archived": True})
                    .eq("id", org_id)
                    .execute()
                )
            except Exception as e:
                logger.warning("archive org %s failed: %s", org_id, e)
                continue
        try:
            await admin_client.auth.admin.delete_user(row["user_id"])
        except Exception as e:
            logger.warning("delete test user %s failed: %s", row["user_id"], e)
            continue
        await write_admin_audit(
            admin_client,
            admin_user_id=auth["user_id"],
            action="bulk_archive_test",
            target_org_id=org_id,
            target_user_id=row["user_id"],
            after=row,
            note="DELETE_TEST_FIRMS",
        )
        archived.append(row)

    return {
        "status": "success",
        "dry_run": False,
        "count": len(archived),
        "archived": archived,
    }


# ─── Alerts (P3) ────────────────────────────────────────────────────────────


@router.get("/alerts/status")
async def alerts_status(auth: dict = Depends(verify_super_admin)):
    admin_client = await _admin_client()
    count, top = await ops_alerts.count_recent_errors(admin_client, minutes=15)
    state = await ops_alerts.get_alert_state(admin_client)
    return {
        "status": "success",
        "error_count_15m": count,
        "threshold": ops_alerts.spike_threshold(),
        "cooldown_minutes": ops_alerts.cooldown_minutes(),
        "last_fired_at": state.get("last_fired_at"),
        "last_count": state.get("last_count"),
        "top_event_types": top,
        "healthy": count < ops_alerts.spike_threshold(),
    }


@router.post("/alerts/check")
async def alerts_check(
    request: Request,
    x_ops_alert_secret: str | None = Header(None, alias="X-Ops-Alert-Secret"),
):
    """
    Cron-safe spike check. Auth via shared secret (not user JWT).
    """
    expected = ops_alerts.alert_secret()
    if not expected:
        raise HTTPException(status_code=503, detail="OPS_ALERT_SECRET not configured")
    provided = x_ops_alert_secret or request.headers.get("X-Ops-Alert-Secret")
    if not provided or provided != expected:
        raise HTTPException(status_code=401, detail="Invalid ops alert secret")

    admin_client = await _admin_client()
    result = await ops_alerts.run_spike_check(admin_client)
    return {"status": "success", **result}
