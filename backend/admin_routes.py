import os
from fastapi import APIRouter, HTTPException, Header, Depends
from supabase import create_async_client
from pydantic import BaseModel

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Needed to list users if we want, but we can query invoices for now.
SUPER_ADMIN_EMAIL = os.getenv("VITE_SUPER_ADMIN_EMAIL", "dev@payforce.com")

async def verify_super_admin(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
        
    token = authorization.replace("Bearer ", "")
    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    user_resp = await supabase_client.auth.get_user(token)
    if not user_resp or not user_resp.user:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    allowed_emails = ["admin@payforce.in", "dev@payforce.com", SUPER_ADMIN_EMAIL]
    if user_resp.user.email not in allowed_emails:
        raise HTTPException(status_code=403, detail="Forbidden: You are not the Super Admin.")
        
    return user_resp.user

@router.get("/api/admin/metrics")
async def get_admin_metrics(user = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch metrics.")
        
    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Get total invoices
    inv_resp = await admin_client.table("invoices").select("id", count="exact").execute()
    total_invoices = inv_resp.count if inv_resp.count else 0
    
    # Get total active clients (distinct client_ids)
    client_resp = await admin_client.table("clients").select("id", count="exact").execute()
    total_clients = client_resp.count if client_resp.count else 0
    
    # Get all tenants (CA firms / users). We can query the profiles table if it exists.
    # We'll just group invoices by user_id to see active tenants.
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

@router.post("/api/admin/tenants/{tenant_id}/update")
async def update_tenant_quota(tenant_id: str, data: QuotaUpdate, user = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update quotas.")
        
    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Update credits in profiles table
    resp = await admin_client.table("profiles").update({"credits": data.new_quota}).eq("id", tenant_id).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Failed to update tenant quota or tenant not found.")
        
    return {"status": "success", "message": f"Quota updated to {data.new_quota}"}

@router.get("/api/admin/tenants")
async def get_all_tenants(user = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot fetch tenants.")
        
    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # 1. Fetch all profiles
    profiles_resp = await admin_client.table("profiles").select("*").execute()
    profiles = profiles_resp.data if profiles_resp.data else []
    
    # 2. Fetch all invoices to count usage per tenant
    invoices_resp = await admin_client.table("invoices").select("user_id").execute()
    invoices = invoices_resp.data if invoices_resp.data else []
    
    # 3. Aggregate invoice count per user_id
    usage_map = {}
    for inv in invoices:
        uid = inv.get("user_id")
        if uid:
            usage_map[uid] = usage_map.get(uid, 0) + 1
            
    # 4. Try to fetch auth users if we can
    user_emails = {}
    try:
        auth_users = await admin_client.auth.admin.list_users()
        if isinstance(auth_users, list):
            for u in auth_users:
                user_emails[u.id] = u.email
        elif auth_users and hasattr(auth_users, 'users'):
            for u in auth_users.users:
                user_emails[u.id] = u.email
    except Exception as e:
        print(f"Warning: Could not fetch auth users: {e}")
        
    # 4.5. Fetch clients managed by each CA firm
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

@router.post("/api/admin/tenants/{tenant_id}/profile")
async def update_tenant_profile(tenant_id: str, data: ProfileUpdate, user = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot update profile.")
        
    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Update company_name in profiles table
    resp = await admin_client.table("profiles").update({"company_name": data.company_name}).eq("id", tenant_id).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Failed to update tenant profile or tenant not found.")
        
    return {"status": "success", "message": "Profile updated successfully."}
@router.delete("/api/admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user = Depends(verify_super_admin)):
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env. Cannot delete tenant.")
        
    admin_client = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    try:
        # Deleting the user from auth.users will cascade and delete their profile, clients, invoices, etc.
        await admin_client.auth.admin.delete_user(tenant_id)
        return {"status": "success", "message": "Tenant account deleted permanently."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete tenant: {str(e)}")
