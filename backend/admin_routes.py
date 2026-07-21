import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from supabase import create_async_client
from pydantic import BaseModel

from utils import get_current_user, resolve_active_org_id

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


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

    return {
        "metrics": {
            "total_invoices": total_invoices,
            "estimated_cost_inr": round(total_invoices * 0.065, 2),
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


@router.get("/tenants")
async def get_all_tenants(
    auth: dict = Depends(verify_super_admin),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch tenants.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 1. Paginated profiles (newest first)
    profiles_query = (
        admin_client.table("profiles")
        .select("id, company_name, active_org_id, created_at", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    profiles_resp = await profiles_query.execute()
    profiles = profiles_resp.data if profiles_resp.data else []
    total = profiles_resp.count if profiles_resp.count is not None else len(profiles)

    # 2. Org wallet credits for this page
    org_ids = [p.get("active_org_id") for p in profiles if p.get("active_org_id")]
    credits_map: dict[str, int] = {}
    if org_ids:
        try:
            orgs_resp = await admin_client.table("organizations").select("id, credits").in_("id", org_ids).execute()
            for row in orgs_resp.data or []:
                credits_map[row["id"]] = int(row.get("credits") or 0)
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

    # 4. Auth emails (paginated admin list; fail open)
    user_emails = {}
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
            elif auth_users and hasattr(auth_users, 'users'):
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

    # 5. Clients managed — scoped to page user_ids
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

    # 6. Build page array
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

        org_id = profile.get("active_org_id")
        tenants.append({
            "id": uid,
            "company_name": company,
            "email": email,
            "credits": credits_map.get(org_id, 0) if org_id else 0,
            "created_at": profile.get("created_at"),
            "invoices_processed": usage_map.get(uid, 0),
            "clients_managed": clients_map.get(uid, 0)
        })

    return {
        "status": "success",
        "tenants": tenants,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": (offset + len(tenants)) < total,
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
