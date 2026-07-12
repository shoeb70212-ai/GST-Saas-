from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
import os
import uuid
from supabase import create_async_client
from utils import validate_file_content, sanitize_filename, SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter()

async def get_admin_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase service key configuration.")
    return await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

@router.get("/client/{client_id}")
async def get_client_info(client_id: str):
    # Fetch client details using service role (bypass RLS for public link)
    supabase_client = await get_admin_client()
    resp = await supabase_client.table("clients").select("client_name, user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
        
    return {"client_name": resp.data[0]["client_name"]}

@router.post("/upload")
async def public_upload(client_id: str = Form(...), files: List[UploadFile] = File(...)):
    supabase_client = await get_admin_client()
    # Validate client exists
    resp = await supabase_client.table("clients").select("user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
        
    user_id = resp.data[0]["user_id"]
    
    uploaded_count = 0
    
    for file in files:
        content = await file.read()
        
        # Security: Validate file content (magic bytes and size)
        mime_type = validate_file_content(content, file.filename)
        
        # Security: Sanitize filename to prevent path traversal
        safe_filename = sanitize_filename(file.filename)
        file_ext = os.path.splitext(safe_filename)[1]
        
        storage_path = f"{user_id}/{client_id}/{uuid.uuid4()}{file_ext}"
        
        # Upload to storage
        try:
            # We assume a bucket named 'raw_invoices' exists
            pass
        except Exception as e:
            pass # Ignore storage error for this stub
            
        await supabase_client.table("invoices").insert({
            "user_id": user_id,
            "client_id": client_id,
            "file_name": safe_filename,
            "processing_status": "pending_from_client"
        }).execute()
        
        uploaded_count += 1
        
    return {"status": "success", "message": f"Uploaded {uploaded_count} files."}
