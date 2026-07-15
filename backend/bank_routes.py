import os
import uuid
import httpx
import pandas as pd
import io
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
from supabase import create_async_client
from bank_service import process_bank_statement_bg

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

@router.get("/list/{client_id}")
async def list_bank_statements(client_id: str, authorization: str = Header(None)):
    """Returns all bank statements for a client, ordered newest first."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)

    resp = await sc.table("bank_statements")\
        .select("id, bank_name, account_number, status, file_url, created_at")\
        .eq("client_id", client_id)\
        .order("created_at", desc=True)\
        .execute()

    return {"status": "success", "data": resp.data}

@router.post("/upload")
async def upload_bank_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    user_id = await get_user_from_token(token)
    
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    # Check credits
    profile_resp = await sc.table("profiles").select("credits").eq("id", user_id).execute()
    if not profile_resp.data or profile_resp.data[0].get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Insufficient credits.")
        
    statement_id = str(uuid.uuid4())
    
    # Create DB record
    await sc.table("bank_statements").insert({
        "id": statement_id,
        "user_id": user_id,
        "client_id": client_id,
        "status": "processing"
    }).execute()
    
    # Upload original to Supabase
    file_path = f"{client_id}/bank_{statement_id}.pdf"
    try:
        sc.storage.from_("invoices").upload(file_path, content, {"content-type": "application/pdf"})
        file_url = sc.storage.from_("invoices").get_public_url(file_path)
        await sc.table("bank_statements").update({"file_url": file_url}).eq("id", statement_id).execute()
    except Exception as e:
        print(f"Storage upload failed: {e}")
    
    # Deduct credit
    await sc.rpc("decrement_credits", {"user_id_param": user_id}).execute()
    
    # Start background task
    background_tasks.add_task(process_bank_statement_bg, statement_id, content, user_id, client_id)
    
    return {"status": "success", "statement_id": statement_id, "message": "Bank statement is processing in the background."}

@router.get("/{statement_id}/status")
async def get_statement_status(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    resp = await sc.table("bank_statements").select("status, bank_name, account_number, file_url").eq("id", statement_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Statement not found.")
        
    return {"status": "success", "data": resp.data[0]}

@router.get("/{statement_id}/transactions")
async def get_transactions(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    resp = await sc.table("bank_transactions").select("*").eq("statement_id", statement_id).order("txn_date").execute()
    return {"status": "success", "data": resp.data}

@router.get("/{statement_id}/export")
async def export_excel(statement_id: str, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
    
    # 1. Hard UI Block Enforced on Backend
    txns_resp = await sc.table("bank_transactions").select("*").eq("statement_id", statement_id).order("txn_date").execute()
    if not txns_resp.data:
        raise HTTPException(status_code=404, detail="No transactions found.")
        
    for txn in txns_resp.data:
        if txn.get("needs_manual_review") or txn.get("has_math_error"):
            raise HTTPException(status_code=400, detail="Cannot export. There are transactions that require manual review.")
            
    # 2. Export to Excel
    df = pd.DataFrame(txns_resp.data)
    
    # Drop internal columns safely
    cols_to_drop = ["id", "statement_id", "has_math_error", "needs_manual_review", "created_at"]
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns])
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Transactions")
    output.seek(0)
    
    headers = {
        'Content-Disposition': f'attachment; filename="bank_statement_{statement_id}.xlsx"'
    }
    
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
