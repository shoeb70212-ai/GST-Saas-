import io
import zipfile
import base64
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, BackgroundTasks, Form
import os
import re
from supabase import create_async_client
from main import run_ai_extraction, SUPABASE_URL, SUPABASE_ANON_KEY
from utils import validate_file_content, sanitize_filename

def format_date_to_iso(date_str):
    if not date_str: return None
    s = str(date_str).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s): return s
    match = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', s)
    if match:
        d, m, y = match.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    return None

import asyncio
ai_semaphore = None

async def get_semaphore():
    global ai_semaphore
    if ai_semaphore is None:
        ai_semaphore = asyncio.Semaphore(5)
    return ai_semaphore

router = APIRouter()

async def process_batch_worker(invoice_id: str, content: bytes, mime_type: str, user_id: str, token: str):
    try:
        # Rate limit concurrent AI calls to prevent 429s (OpenRouter/Gemini)
        sem = await get_semaphore()
        async with sem:
            data_dict = await run_ai_extraction(content, mime_type)
        
        # Deduct Credit
        supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        supabase_client.postgrest.auth(token)
        
        await supabase_client.rpc("decrement_credits", {"user_id_param": user_id}).execute()
            
        # Prepare update payload
        db_update = {k.lower(): v for k, v in data_dict.items() if k != "Line_Items"}
        
        # Format Dates safely
        if "invoice_date" in db_update:
            db_update["invoice_date"] = format_date_to_iso(db_update["invoice_date"])
        if "due_date" in db_update:
            db_update["due_date"] = format_date_to_iso(db_update["due_date"])
            
        db_update["processing_status"] = "completed"
        db_update["error_message"] = None
        
        # Update Invoice Record
        await supabase_client.table("invoices").update(db_update).eq("id", invoice_id).execute()
        
        # Insert Line Items
        line_items = data_dict.get("Line_Items", [])
        if line_items:
            items_payload = []
            for li in line_items:
                items_payload.append({
                    "invoice_id": invoice_id,
                    "description": li.get("Description"),
                    "hsn_sac": li.get("HSN_SAC"),
                    "quantity": li.get("Quantity"),
                    "unit_price": li.get("Unit_Price"),
                    "tax_rate": li.get("Tax_Rate"),
                    "amount": li.get("Amount")
                })
            resp = await supabase_client.table("invoice_line_items").insert(items_payload).execute()
            if not resp.data:
                raise Exception("Database error: Failed to insert line items")
                
    except Exception as e:
        # Mark as failed
        supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        supabase_client.postgrest.auth(token)
        await supabase_client.table("invoices").update({"processing_status": "failed", "error_message": str(e)}).eq("id", invoice_id).execute()

@router.post("/api/upload-batch")
async def upload_batch(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    client_id: str = Form(...),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    
    # 1. Verify User and Get Profile
    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    try:
        user_resp = await supabase_client.auth.get_user(token)
        user_id = user_resp.user.id
        supabase_client.postgrest.auth(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")
        
    # Process Zip as stream
    try:
        with zipfile.ZipFile(file.file) as z:
            file_names = z.namelist()
            valid_exts = ['.jpg', '.jpeg', '.png', '.pdf', '.webp']
            valid_files = [f for f in file_names if any(f.lower().endswith(ext) for ext in valid_exts) and not f.startswith('__MACOSX')]
            
            if not valid_files:
                raise HTTPException(status_code=400, detail="No valid images or PDFs found in ZIP.")
            
            batch_ids = []
            
            # Prepare batch for bulk insert
            pending_records = []
            file_details = []
            
            total_uncompressed_size = 0
            MAX_TOTAL_SIZE = 50 * 1024 * 1024 # 50MB max total uncompressed
            
            for fname in valid_files:
                file_info = z.getinfo(fname)
                total_uncompressed_size += file_info.file_size
                if total_uncompressed_size > MAX_TOTAL_SIZE:
                    raise HTTPException(status_code=413, detail="Zip archive is too large when uncompressed (Zip Bomb prevention).")
                
                file_bytes = z.read(fname)
                try:
                    mime_type = validate_file_content(file_bytes, fname)
                except HTTPException:
                    continue # Skip invalid files
                
                safe_fname = sanitize_filename(fname.split('/')[-1])
                
                pending_records.append({
                    "user_id": user_id,
                    "client_id": client_id,
                    "file_name": safe_fname,
                    "processing_status": "pending"
                })
                file_details.append({
                    "bytes": file_bytes,
                    "mime": mime_type
                })
                
            if pending_records:
                ins_resp = await supabase_client.table("invoices").insert(pending_records).execute()
                if ins_resp.data:
                    for i, row in enumerate(ins_resp.data):
                        invoice_id = row["id"]
                        batch_ids.append(invoice_id)
                        
                        background_tasks.add_task(
                            process_batch_worker, 
                            invoice_id=invoice_id, 
                            content=file_details[i]["bytes"], 
                            mime_type=file_details[i]["mime"], 
                            user_id=user_id, 
                            token=token
                        )
                else:
                    print("Failed to bulk insert pending invoices")
                        
            return {"status": "success", "message": f"Queued {len(batch_ids)} files for processing.", "queued_ids": batch_ids}
            
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
