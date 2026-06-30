import pandas as pd
import io
import asyncio
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, Form
import httpx
from main import SUPABASE_URL, SUPABASE_ANON_KEY

router = APIRouter()

@router.post("/api/reconcile")
async def reconcile_gstr2b(
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
    
    try:
        df_full = pd.read_excel(io.BytesIO(content), sheet_name='B2B', header=None, engine='openpyxl')
        header_idx = 0
        for i, row in df_full.iterrows():
            row_str = " ".join([str(x).lower() for x in row.values])
            if "gstin of supplier" in row_str:
                header_idx = i
                break
                
        df = pd.read_excel(io.BytesIO(content), sheet_name='B2B', header=header_idx, engine='openpyxl')
        df.columns = [str(c).strip().replace('\n', ' ') for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse B2B sheet in GSTR-2B file: {str(e)}")

    col_mapping = {}
    for col in df.columns:
        cl = col.lower()
        if 'gstin of supplier' in cl: col_mapping['gstin'] = col
        elif 'invoice number' in cl: col_mapping['invoice_num'] = col
        elif 'invoice date' in cl: col_mapping['invoice_date'] = col
        elif 'taxable value' in cl: col_mapping['taxable_value'] = col
        elif 'integrated tax' in cl: col_mapping['igst'] = col
        elif 'central tax' in cl: col_mapping['cgst'] = col
        elif 'state/ut tax' in cl: col_mapping['sgst'] = col
        elif 'itc availability' in cl: col_mapping['itc_avail'] = col
        
    records = []
    for _, row in df.iterrows():
        if pd.isna(row.get(col_mapping.get('gstin'))):
            continue
            
        gstin = str(row[col_mapping['gstin']]).strip()
        inv_num = str(row[col_mapping['invoice_num']]).strip()
        if not gstin or gstin == 'nan': continue
        
        records.append({
            "user_id": user_id,
            "client_id": client_id,
            "period": period,
            "supplier_gstin": gstin,
            "invoice_number": inv_num,
            "invoice_date": str(row.get(col_mapping.get('invoice_date', ''))),
            "taxable_value": float(row.get(col_mapping.get('taxable_value', 0)) or 0),
            "igst": float(row.get(col_mapping.get('igst', 0)) or 0),
            "cgst": float(row.get(col_mapping.get('cgst', 0)) or 0),
            "sgst": float(row.get(col_mapping.get('sgst', 0)) or 0),
            "itc_available": str(row.get(col_mapping.get('itc_avail', ''))),
            "raw_json": {str(k): str(v) for k,v in row.to_dict().items() if not pd.isna(v)}
        })
        
    async with httpx.AsyncClient() as http_client:
        await http_client.delete(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        
        chunk_size = 500
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i+chunk_size]
            await http_client.post(
                f"{SUPABASE_URL}/rest/v1/gstr2b_records",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=chunk
            )
            
        pr_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}&select=id,supplier_gstin,invoice_number,taxable_amount,total_amount,recon_status,recon_period",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        pr_invoices = pr_resp.json()
        
    def clean_str(s):
        if not s: return ""
        return str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
        
    two_b_dict = {f"{clean_str(r['supplier_gstin'])}_{clean_str(r['invoice_number'])}": r for r in records}
    updates = []
    
    for inv in pr_invoices:
        key = f"{clean_str(inv.get('supplier_gstin'))}_{clean_str(inv.get('invoice_number'))}"
        
        if key in two_b_dict:
            b2b_rec = two_b_dict[key]
            scanned_tax = float(inv.get('taxable_amount') or 0)
            b2b_tax = float(b2b_rec['taxable_value'] or 0)
            
            if abs(scanned_tax - b2b_tax) <= 1.0:
                status = "matched"
            else:
                status = "mismatch"
                
            updates.append({
                "id": inv['id'],
                "recon_status": status,
                "recon_period": period
            })
            del two_b_dict[key]
        else:
            if not inv.get('recon_status') or inv.get('recon_status') in ['unreconciled', 'missing_in_2b']:
                updates.append({
                    "id": inv['id'],
                    "recon_status": "missing_in_2b",
                    "recon_period": period
                })
                
    async with httpx.AsyncClient() as http_client:
        async def update_inv(u):
            await http_client.patch(
                f"{SUPABASE_URL}/rest/v1/invoices?id=eq.{u['id']}",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"recon_status": u['recon_status'], "recon_period": u['recon_period']}
            )
            
        if updates:
            chunk_size = 50
            for i in range(0, len(updates), chunk_size):
                chunk = updates[i:i+chunk_size]
                await asyncio.gather(*(update_inv(u) for u in chunk))
    return {"status": "success", "message": f"Reconciled {len(records)} records from 2B against {len(pr_invoices)} Purchase Register invoices."}
