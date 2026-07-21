import os
import logging
from fastapi import APIRouter, HTTPException, Header, Depends
from supabase import create_async_client
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


async def verify_super_admin(authorization: str = Header(None)):
    """
    Verify the user is a super admin using a database-backed role.
    Checks the `is_super_admin` flag on the user's profile row.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = authorization.replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token format")

    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    try:
        user_resp = await supabase_client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not user_resp or not user_resp.user:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = user_resp.user.id

    # Check is_super_admin flag from profiles table (database-backed role)
    try:
        supabase_client.postgrest.auth(token)
        profile_resp = await supabase_client.table("profiles").select("is_super_admin").eq("id", user_id).execute()

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

    return user_resp.user


@router.get("/metrics")
async def get_admin_metrics(user=Depends(verify_super_admin)):
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
async def update_tenant_quota(tenant_id: str, data: QuotaUpdate, user=Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update quotas.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Org wallet is authoritative (profiles.credits dropped in phase 54)
    profile_resp = await admin_client.table("profiles").select("active_org_id").eq("id", tenant_id).maybe_single().execute()
    org_id = profile_resp.data.get("active_org_id") if profile_resp.data else None
    if not org_id:
        org_resp = await admin_client.table("organizations").select("id").eq("owner_id", tenant_id).limit(1).execute()
        org_id = org_resp.data[0]["id"] if org_resp.data else None
    if not org_id:
        raise HTTPException(status_code=404, detail="Tenant organization not found")

    resp = await admin_client.table("organizations").update({"credits": data.new_quota}).eq("id", org_id).execute()

    # Check for error instead of empty data (Supabase updates can return empty data on success)
    if hasattr(resp, 'error') and resp.error:
        raise HTTPException(status_code=400, detail=f"Failed to update tenant quota: {resp.error}")

    return {"status": "success", "message": f"Quota updated to {data.new_quota}"}


@router.get("/tenants")
async def get_all_tenants(user=Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch tenants.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 1. Fetch all profiles
    profiles_resp = await admin_client.table("profiles").select("*").execute()
    profiles = profiles_resp.data if profiles_resp.data else []

    # 2. Fetch usage counts via materialized view (avoids loading all invoices into memory)
    usage_map = {}
    try:
        usage_resp = await admin_client.table("tenant_usage").select("user_id, invoice_count").execute()
        if usage_resp.data:
            for row in usage_resp.data:
                uid = row.get("user_id")
                if uid:
                    usage_map[uid] = row.get("invoice_count", 0)
    except Exception as e:
        # Fallback: if materialized view doesn't exist, query invoices directly
        logger.warning(f"tenant_usage view not available, falling back to direct query: {e}")
        invoices_resp = await admin_client.table("invoices").select("user_id").execute()
        invoices = invoices_resp.data if invoices_resp.data else []
        for inv in invoices:
            uid = inv.get("user_id")
            if uid:
                usage_map[uid] = usage_map.get(uid, 0) + 1

    # 3. Try to fetch auth users if we can
    user_emails = {}
    try:
        page = 1
        per_page = 1000
        while True:
            try:
                auth_users = await admin_client.auth.admin.list_users(page=page, per_page=per_page)
            except TypeError:
                # Fallback if the Supabase python client version doesn't support pagination args
                if page > 1: break
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
            if page > 20: # Failsafe: max 20,000 users to prevent server OOM
                break
    except Exception as e:
        logger.warning(f"Could not fetch auth users: {e}")

    # 4. Fetch clients managed by each CA firm
    clients_resp = await admin_client.table("clients").select("user_id").execute()
    clients = clients_resp.data if clients_resp.data else []
    clients_map = {}
    for c in clients:
        uid = c.get("user_id")
        if uid:
            clients_map[uid] = clients_map.get(uid, 0) + 1

    # 5. Build final array
    tenants = []
    for profile in profiles:
        uid = profile.get("id")
        email = user_emails.get(uid, "Unknown Email")
        company = profile.get("company_name")
        if not company or not str(company).strip():
            # Fallback to email prefix or domain
            if "@" in email:
                domain = email.split("@")[1].split(".")[0]
                company = domain.capitalize() + " Firm"
            else:
                company = "Unknown Company"

        tenants.append({
            "id": uid,
            "company_name": company,
            "email": email,
            "credits": profile.get("credits", 0),
            "created_at": profile.get("created_at"),
            "invoices_processed": usage_map.get(uid, 0),
            "clients_managed": clients_map.get(uid, 0)
        })

    # Sort by created_at descending
    tenants.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {"status": "success", "tenants": tenants}


class ProfileUpdate(BaseModel):
    company_name: str


@router.post("/tenants/{tenant_id}/profile")
async def update_tenant_profile(tenant_id: str, data: ProfileUpdate, user=Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update profile.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Update company_name in profiles table
    resp = await admin_client.table("profiles").update({"company_name": data.company_name}).eq("id", tenant_id).execute()

    # Check for error instead of empty data (Supabase updates can return empty data on success)
    if hasattr(resp, 'error') and resp.error:
        raise HTTPException(status_code=400, detail=f"Failed to update tenant profile: {resp.error}")

    return {"status": "success", "message": "Profile updated successfully."}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user=Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot delete tenant.")

    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    try:
        # Deleting the user from auth.users will cascade and delete their profile, clients, invoices, etc.
        await admin_client.auth.admin.delete_user(tenant_id)
        logger.info(f"Tenant {tenant_id} deleted by admin {user.id if hasattr(user, 'id') else 'unknown'}")
        return {"status": "success", "message": "Tenant account deleted permanently."}
    except Exception as e:
        logger.error(f"Failed to delete tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete tenant: {str(e)}")