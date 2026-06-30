import io
import zipfile
import base64
import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, BackgroundTasks, Form
import os
import re
from main import run_ai_extraction, SUPABASE_URL, SUPABASE_ANON_KEY

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
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"user_id_param": user_id}
            )
            
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
            await http_client.patch(
                f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{invoice_id}",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=db_update
            )
            
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
                resp = await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/invoice_line_items",
                    headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json=items_payload
                )
                if resp.status_code not in [200, 201]:
                    raise Exception(f"Failed to insert line items: {resp.text}")
                
    except Exception as e:
        # Mark as failed
        async with httpx.AsyncClient() as http_client:
            await http_client.patch(
                f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{invoice_id}",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"processing_status": "failed", "error_message": str(e)}
            )

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
    async with httpx.AsyncClient() as http_client:
        user_resp = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        user_id = user_resp.json().get("id")
        
    # Read Zip
    content = await file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            file_names = z.namelist()
            valid_exts = ['.jpg', '.jpeg', '.png', '.pdf', '.webp']
            valid_files = [f for f in file_names if any(f.lower().endswith(ext) for ext in valid_exts) and not f.startswith('__MACOSX')]
            
            if not valid_files:
                raise HTTPException(status_code=400, detail="No valid images or PDFs found in ZIP.")
            
            batch_ids = []
            
            # Create a pending record for each valid file
            async with httpx.AsyncClient() as http_client:
                for fname in valid_files:
                    file_bytes = z.read(fname)
                    # We can store raw bytes in memory since BackgroundTasks run in the same process
                    # But ideally we'd store in Supabase Storage. For simplicity, we pass bytes to memory task.
                    
                    mime_type = "image/jpeg"
                    if fname.lower().endswith('.png'): mime_type = "image/png"
                    if fname.lower().endswith('.webp'): mime_type = "image/webp"
                    if fname.lower().endswith('.pdf'): mime_type = "application/pdf"
                    
                    # Insert pending row
                    ins_resp = await http_client.post(
                        f"{SUPABASE_URL}/rest/v1/invoices",
                        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"},
                        json={
                            "user_id": user_id,
                            "client_id": client_id,
                            "file_name": fname.split('/')[-1],
                            "processing_status": "pending"
                        }
                    )
                    
                    if ins_resp.status_code in [200, 201]:
                        row_data = ins_resp.json()
                        invoice_id = row_data[0]["id"]
                        batch_ids.append(invoice_id)
                        
                        # Queue background task
                        background_tasks.add_task(
                            process_batch_worker, 
                            invoice_id=invoice_id, 
                            content=file_bytes, 
                            mime_type=mime_type, 
                            user_id=user_id, 
                            token=token
                        )
                    else:
                        print(f"Failed to create pending invoice record: {ins_resp.text}")
                        
            return {"status": "success", "message": f"Queued {len(batch_ids)} files for processing.", "queued_ids": batch_ids}
            
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
