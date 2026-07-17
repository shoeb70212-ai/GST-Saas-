import pandas as pd
import io
import asyncio
import calendar
from datetime import date
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, Form
import httpx
import os
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")


router = APIRouter()

def period_to_date_range(period: str):
    """
    period is 'MM-YYYY'.
    Returns (first_day, last_day) as ISO date strings.
    """
    try:
        month_str, year_str = period.split('-')
        month, year = int(month_str), int(year_str)
        first_day = date(year, month, 1)
        last_day = date(year, month, calendar.monthrange(year, month)[1])
        return first_day.isoformat(), last_day.isoformat()
    except Exception:
        return None, None

def clean_str(s):
    if not s: return ""
    import re
    s = str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
    return re.sub(r'(\D)0+(\d)', r'\1\2', s)

@router.post("/upload")
async def upload_sales_register(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period: str = Form(...),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    
    async with httpx.AsyncClient() as http_client:
        user_resp = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        user_id = user_resp.json().get("id")
        
    content = await file.read()
    
    records = []
    
    # Try parsing B2B sheet
    try:
        df_b2b_full = pd.read_excel(io.BytesIO(content), sheet_name='b2b', header=None, engine='openpyxl')
        header_idx = 0
        for i, row in df_b2b_full.iterrows():
            row_str = " ".join([str(x).lower() for x in row.values])
            if "gstin/uin of recipient" in row_str or "receiver gstin" in row_str:
                header_idx = i
                break
                
        df_b2b = pd.read_excel(io.BytesIO(content), sheet_name='b2b', header=header_idx, engine='openpyxl')
        df_b2b.columns = [str(c).strip().replace('\n', ' ') for c in df_b2b.columns]
        
        # Mapping columns
        col_mapping = {}
        for col in df_b2b.columns:
            cl = col.lower()
            if 'gstin/uin' in cl or 'receiver gstin' in cl: col_mapping['gstin'] = col
            elif 'invoice number' in cl: col_mapping['invoice_num'] = col
            elif 'invoice date' in cl: col_mapping['invoice_date'] = col
            elif 'taxable value' in cl: col_mapping['taxable_value'] = col
            elif 'integrated tax' in cl or 'igst' in cl: col_mapping['igst'] = col
            elif 'central tax' in cl or 'cgst' in cl: col_mapping['cgst'] = col
            elif 'state/ut tax' in cl or 'sgst' in cl: col_mapping['sgst'] = col

        for _, row in df_b2b.iterrows():
            gstin_col = col_mapping.get('gstin')
            if not gstin_col: continue
            if pd.isna(row.get(gstin_col)): continue
                
            gstin = clean_str(row.get(gstin_col, ''))
            inv_num = str(row.get(col_mapping.get('invoice_num', ''), '')).strip()
            
            if not gstin or gstin == 'nan': continue
            
            taxable_val = float(row.get(col_mapping.get('taxable_value', 0)) or 0)
            is_credit_note = taxable_val < 0
            
            records.append({
                "user_id": user_id,
                "client_id": client_id,
                "period": period,
                "invoice_type": "B2B",
                "customer_gstin": gstin,
                "invoice_number": inv_num,
                "invoice_date": str(row.get(col_mapping.get('invoice_date', ''))),
                "taxable_value": taxable_val,
                "igst": float(row.get(col_mapping.get('igst', 0)) or 0),
                "cgst": float(row.get(col_mapping.get('cgst', 0)) or 0),
                "sgst": float(row.get(col_mapping.get('sgst', 0)) or 0),
                "is_credit_note": is_credit_note
            })
    except Exception as e:
        print(f"Skipping B2B sheet or failed to parse: {e}")
        
    # Try parsing B2CS (B2C Small) sheet
    try:
        df_b2cs_full = pd.read_excel(io.BytesIO(content), sheet_name='b2cs', header=None, engine='openpyxl')
        header_idx = 0
        for i, row in df_b2cs_full.iterrows():
            row_str = " ".join([str(x).lower() for x in row.values])
            if "taxable value" in row_str and "rate" in row_str:
                header_idx = i
                break
                
        df_b2cs = pd.read_excel(io.BytesIO(content), sheet_name='b2cs', header=header_idx, engine='openpyxl')
        df_b2cs.columns = [str(c).strip().replace('\n', ' ') for c in df_b2cs.columns]
        
        col_mapping_b2c = {}
        for col in df_b2cs.columns:
            cl = col.lower()
            if 'taxable value' in cl: col_mapping_b2c['taxable_value'] = col
            elif 'integrated tax' in cl or 'igst' in cl: col_mapping_b2c['igst'] = col
            elif 'central tax' in cl or 'cgst' in cl: col_mapping_b2c['cgst'] = col
            elif 'state/ut tax' in cl or 'sgst' in cl: col_mapping_b2c['sgst'] = col

        for _, row in df_b2cs.iterrows():
            taxable_val = float(row.get(col_mapping_b2c.get('taxable_value', 0)) or 0)
            if pd.isna(taxable_val) or taxable_val == 0: continue
            
            is_credit_note = taxable_val < 0
            
            records.append({
                "user_id": user_id,
                "client_id": client_id,
                "period": period,
                "invoice_type": "B2C",
                "customer_gstin": None,
                "invoice_number": "B2CS-BULK",
                "invoice_date": None,
                "taxable_value": taxable_val,
                "igst": float(row.get(col_mapping_b2c.get('igst', 0)) or 0),
                "cgst": float(row.get(col_mapping_b2c.get('cgst', 0)) or 0),
                "sgst": float(row.get(col_mapping_b2c.get('sgst', 0)) or 0),
                "is_credit_note": is_credit_note
            })
    except Exception as e:
        print(f"Skipping B2CS sheet or failed to parse: {e}")

    if not records:
        raise HTTPException(status_code=400, detail="No valid B2B or B2C sales records found in the uploaded GSTR-1 file.")

    async with httpx.AsyncClient() as http_client:
        # Delete old records for this period (Idempotency)
        await http_client.delete(
            f"{SUPABASE_URL}/rest/v1/sales_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        
        # Insert new records
        chunk_size = 500
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i+chunk_size]
            resp = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/sales_records",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=chunk
            )
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail="Failed to insert sales records.")
                
    return {"status": "success", "message": f"Successfully parsed and stored {len(records)} sales records for Liability Prediction."}

@router.get("/prediction")
async def get_prediction(
    client_id: str,
    period: str,
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    
    async with httpx.AsyncClient() as http_client:
        # Execute the RPC to calculate the exact cash liability
        rpc_resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/get_tax_liability_prediction",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"client_id_param": client_id, "period_param": period}
        )
        
        if rpc_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to calculate tax liability prediction.")
            
        data = rpc_resp.json()
        return {"status": "success", "data": data}
