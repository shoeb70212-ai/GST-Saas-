import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from utils import verify_client_access, get_current_user
from reconcile_service import run_ai_matching_engine

router = APIRouter()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")


class RunEngineRequest(BaseModel):
    client_id: str

@router.post("/run")
async def run_reconciliation(req: RunEngineRequest, auth: dict = Depends(get_current_user)):
    user_id = auth["user_id"]
    sc = auth["supabase_client"]
    await verify_client_access(sc, req.client_id)

    result = await run_ai_matching_engine(req.client_id, user_id)
    return result

@router.get("/suggestions/{client_id}")
async def get_suggestions(client_id: str, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

    resp = await sc.table("reconciliation_matches")\
        .select("*, invoices(*), bank_transactions(*)")\
        .eq("client_id", client_id)\
        .eq("status", "SUGGESTED")\
        .execute()

    return {"status": "success", "data": resp.data}

@router.get("/history/{client_id}")
async def get_history(client_id: str, auth: dict = Depends(get_current_user)):
    """Returns APPROVED matches for the Undo History tab."""
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

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
async def approve_match(req: MatchActionRequest, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    
    # Execute the Atomic RPC Function
    try:
        await sc.rpc("approve_reconciliation_match", {"match_id_param": req.match_id}).execute()
        return {"status": "success", "message": "Match approved and allocations updated atomically."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve match: {str(e)}")

@router.post("/reject")
async def reject_match(req: MatchActionRequest, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    
    await sc.table("reconciliation_matches").update({"status": "REJECTED"}).eq("id", req.match_id).execute()
    return {"status": "success", "message": "Match rejected."}

@router.post("/undo")
async def undo_match(req: MatchActionRequest, auth: dict = Depends(get_current_user)):
    sc = auth["supabase_client"]
    
    # Execute the Atomic RPC Function
    try:
        await sc.rpc("undo_reconciliation_match", {"match_id_param": req.match_id}).execute()
        return {"status": "success", "message": "Match successfully undone."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to undo match: {str(e)}")
