import os
import httpx
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from supabase import create_async_client
from reconcile_service import run_ai_matching_engine

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

async def get_user_from_token(token: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        return resp.json().get("id")

class RunEngineRequest(BaseModel):
    client_id: str

@router.post("/run")
async def run_reconciliation(req: RunEngineRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    user_id = await get_user_from_token(token)
    
    result = await run_ai_matching_engine(req.client_id, user_id)
    return result

@router.get("/suggestions/{client_id}")
async def get_suggestions(client_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    resp = await sc.table("reconciliation_matches")\
        .select("*, invoices(*), bank_transactions(*)")\
        .eq("client_id", client_id)\
        .eq("status", "SUGGESTED")\
        .execute()
        
    return {"status": "success", "data": resp.data}

@router.get("/history/{client_id}")
async def get_history(client_id: str, authorization: str = Header(None)):
    """Returns APPROVED matches for the Undo History tab."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)

    resp = await sc.table("reconciliation_matches")\
        .select("*, invoices(supplier_name, total_amount, invoice_number), bank_transactions(description, withdrawal, txn_date)")\
        .eq("client_id", client_id)\
        .eq("status", "APPROVED")\
        .order("created_at", desc=True)\
        .limit(50)\
        .execute()

    return {"status": "success", "data": resp.data}

class MatchActionRequest(BaseModel):
    match_id: str

@router.post("/approve")
async def approve_match(req: MatchActionRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    # Execute the Atomic RPC Function
    try:
        await sc.rpc("approve_reconciliation_match", {"match_id_param": req.match_id}).execute()
        return {"status": "success", "message": "Match approved and allocations updated atomically."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve match: {str(e)}")

@router.post("/reject")
async def reject_match(req: MatchActionRequest, authorization: str = Header(None)):
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    await sc.table("reconciliation_matches").update({"status": "REJECTED"}).eq("id", req.match_id).execute()
    return {"status": "success", "message": "Match rejected."}

@router.post("/undo")
async def undo_match(req: MatchActionRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    # Execute the Atomic RPC Function
    try:
        await sc.rpc("undo_reconciliation_match", {"match_id_param": req.match_id}).execute()
        return {"status": "success", "message": "Match successfully undone."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to undo match: {str(e)}")
