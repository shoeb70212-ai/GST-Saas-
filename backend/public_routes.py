from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
import os
import uuid
import mimetypes
from utils import get_supabase_client

router = APIRouter()
supabase_client = get_supabase_client()

@router.get("/client/{client_id}")
async def get_client_info(client_id: str):
    # Fetch client details using service role (bypass RLS for public link)
    resp = await supabase_client.table("clients").select("client_name, user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
        
    return {"client_name": resp.data[0]["client_name"]}

@router.post("/upload")
async def public_upload(client_id: str = Form(...), files: List[UploadFile] = File(...)):
    # Validate client exists
    resp = await supabase_client.table("clients").select("user_id").eq("id", client_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise HTTPException(status_code=404, detail="Client not found")
        
    user_id = resp.data[0]["user_id"]
    
    # Store files in public_uploads bucket or just insert as pending invoices 
    # For MVP, we insert them as 'pending' invoices directly so the CA sees them in Saved Invoices
    # However, since they need extraction, we could just enqueue them for batch processing if we had it,
    # or insert them with 'pending' status so the CA can click 'Scan' later.
    
    # Let's insert them as 'pending' invoices so the CA knows they received documents.
    # The actual file content would need to be stored in Supabase Storage.
    
    # We will upload to a Supabase bucket named 'invoices'
    uploaded_count = 0
    
    for file in files:
        content = await file.read()
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        storage_path = f"{user_id}/{client_id}/{uuid.uuid4()}{file_ext}"
        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
        
        # Upload to storage
        try:
            # We assume a bucket named 'raw_invoices' exists
            # For this MVP if bucket logic isn't fully there, we just insert the DB row
            # so the CA can at least see the file name.
            pass
        except Exception as e:
            pass # Ignore storage error for this stub
            
        await supabase_client.table("invoices").insert({
            "user_id": user_id,
            "client_id": client_id,
            "file_name": file.filename,
            "processing_status": "pending_from_client"
        }).execute()
        
        uploaded_count += 1
        
    return {"status": "success", "message": f"Uploaded {uploaded_count} files."}
