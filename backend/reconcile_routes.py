import pandas as pd
import io
import asyncio
import calendar
from datetime import date
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, Form
import httpx
from main import SUPABASE_URL, SUPABASE_ANON_KEY

router = APIRouter()

def period_to_date_range(period: str):
    """
    period is 'MM-YYYY' (as sent by the Reconciliation page's month picker).
    Returns (first_day, last_day) as ISO date strings, or (None, None) if it doesn't parse.
    """
    try:
        month_str, year_str = period.split('-')
        month, year = int(month_str), int(year_str)
        first_day = date(year, month, 1)
        last_day = date(year, month, calendar.monthrange(year, month)[1])
        return first_day.isoformat(), last_day.isoformat()
    except Exception:
        return None, None

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
        gstin_col = col_mapping.get('gstin')
        inv_col = col_mapping.get('invoice_num')
        if not gstin_col or not inv_col: continue
            
        if pd.isna(row.get(gstin_col)):
            continue
            
        gstin = str(row.get(gstin_col, '')).strip()
        inv_num = str(row.get(inv_col, '')).strip()
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
        # 1. Fetch old records for rollback
        fetch_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        old_records = fetch_resp.json() if fetch_resp.status_code == 200 else []

        # 2. Delete old records
        await http_client.delete(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        
        # 3. Insert new records in chunks
        chunk_size = 500
        insert_success = True
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i+chunk_size]
            resp = await http_client.post(
                f"{SUPABASE_URL}/rest/v1/gstr2b_records",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=chunk
            )
            if resp.status_code not in (200, 201):
                insert_success = False
                break
                
        # 4. Rollback if insert failed
        if not insert_success and old_records:
            # Re-insert the old records (stripping IDs if auto-generated)
            for r in old_records:
                r.pop('id', None)
                r.pop('created_at', None)
            
            for i in range(0, len(old_records), chunk_size):
                await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/gstr2b_records",
                    headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json=old_records[i:i+chunk_size]
                )
            raise HTTPException(status_code=500, detail="Failed to insert new reconciliation records. Original records were restored.")
            
        # Scope to invoices dated inside the reconciled month only. Without this, every
        # never-reconciled invoice from *any* earlier month (recon_status is NULL until its
        # own period is first reconciled) would get swept into whichever period you happen to
        # run next and mislabeled "missing_in_2b" for the wrong month - the first reconciliation
        # run on a client with existing history would flag its entire back-catalog incorrectly.
        period_start, period_end = period_to_date_range(period)
        base_url = (
            f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}"
            f"&select=id,supplier_gstin,invoice_number,taxable_amount,total_amount,recon_status,recon_period"
        )
        if period_start and period_end:
            base_url += f"&invoice_date=gte.{period_start}&invoice_date=lte.{period_end}"
        pr_resp = await http_client.get(
            base_url,
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        pr_invoices = pr_resp.json()
        
    def clean_str(s):
        """
        Normalizes invoice numbers and GSTINs by stripping whitespace, hyphens, 
        slashes, and stripping leading zeros from numeric sequences. 
        This is necessary because vendors often write 'INV-001' on paper, 
        but file it as 'INV/1' in the government GSTR-2B portal.
        """
        if not s: return ""
        import re
        s = str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
        return re.sub(r'(\D)0+(\d)', r'\1\2', s)
        
    # Dictionary of GSTR-2B records keyed by a normalized string: "GSTIN_INVOICENUMBER"
    two_b_dict = {f"{clean_str(r['supplier_gstin'])}_{clean_str(r['invoice_number'])}": r for r in records}
    updates = []
    
    # We use RapidFuzz for fuzzy string matching on the invoice numbers.
    # This catches typos or slight OCR mistakes (e.g. '0' vs 'O').
    import rapidfuzz
    
    for inv in pr_invoices:
        my_gstin = clean_str(inv.get('supplier_gstin'))
        my_inv_num = clean_str(inv.get('invoice_number'))
        scanned_tax = float(inv.get('taxable_amount') or 0)
        
        best_match_key = None
        best_score = 0
        best_b2b_rec = None
        
        for key, b2b_rec in two_b_dict.items():
            b2b_gstin, b2b_inv_num = key.split('_', 1)
            if my_gstin != b2b_gstin:
                continue
                
            score = rapidfuzz.fuzz.ratio(my_inv_num, b2b_inv_num)
            if score > best_score:
                best_score = score
                best_match_key = key
                best_b2b_rec = b2b_rec
                
        if best_match_key and best_score >= 75.0:
            b2b_tax = float(best_b2b_rec['taxable_value'] or 0)
            
            if best_score >= 90.0 and abs(scanned_tax - b2b_tax) <= 1.0:
                status = "matched"
            else:
                status = "mismatch"
                
            updates.append({
                "id": inv['id'],
                "recon_status": status,
                "recon_period": period
            })
            del two_b_dict[best_match_key]
        else:
            if not inv.get('recon_status') or inv.get('recon_status') in ['unreconciled', 'missing_in_2b']:
                updates.append({
                    "id": inv['id'],
                    "recon_status": "missing_in_2b",
                    "recon_period": period
                })
                
    if updates:
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/bulk_update_invoices_recon",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"updates": updates}
            )
            
    return {"status": "success", "message": f"Reconciled {len(records)} records from 2B against {len(pr_invoices)} Purchase Register invoices."}

import json

@router.post("/api/reconcile/deep-match")
async def deep_match_reconcile(
    client_id: str = Form(...),
    period: str = Form(...),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    supabase_client = await create_async_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    try:
        user_resp = await supabase_client.auth.get_user(token)
        user_id = user_resp.user.id
        supabase_client.postgrest.auth(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")

    # Fetch PR invoices
    inv_resp = await supabase_client.table("invoices").select("id,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_amount,total_amount,recon_status").eq("client_id", client_id).eq("recon_period", period).execute()
    pr_invoices = inv_resp.data if inv_resp.data else []
    
    missing_in_2b = [inv for inv in pr_invoices if inv.get("recon_status") == "missing_in_2b"]
    matched_invoices = [inv for inv in pr_invoices if inv.get("recon_status") in ["matched", "mismatch"]]
    
    if not missing_in_2b:
        return {"status": "success", "message": "No unmatched Purchase Register invoices found for Deep Match."}
        
    # Fetch 2B records
    b2b_resp = await supabase_client.table("gstr2b_records").select("*").eq("client_id", client_id).eq("period", period).execute()
    b2b_records = b2b_resp.data if b2b_resp.data else []
    
    if not b2b_records:
        return {"status": "success", "message": "No GSTR-2B records found for this period."}
        
    # Filter unmatched 2B records (those not already linked to matched_invoices)
    def clean_str(s):
        if not s: return ""
        import re
        s = str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
        return re.sub(r'(\D)0+(\d)', r'\1\2', s)
        
    matched_2b_keys = {f"{clean_str(inv.get('supplier_gstin'))}_{clean_str(inv.get('invoice_number'))}" for inv in matched_invoices}
    
    unmatched_2b = []
    for rec in b2b_records:
        key = f"{clean_str(rec.get('supplier_gstin'))}_{clean_str(rec.get('invoice_number'))}"
        if key not in matched_2b_keys:
            unmatched_2b.append(rec)
            
    if not unmatched_2b:
        return {"status": "success", "message": "No unmatched GSTR-2B records available for Deep Match."}
        
    # Deduct Credit for Deep Match
    import httpx
    async with httpx.AsyncClient() as http_client:
        rpc_resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"user_id_param": user_id}
        )
        if rpc_resp.status_code != 200:
            raise HTTPException(status_code=402, detail="Insufficient credits for AI Deep Match.")
            
    # Call Gemini for Deep Match
    pr_subset = [{"id": inv["id"], "supplier": inv.get("supplier_name"), "gstin": inv.get("supplier_gstin"), "inv_num": inv.get("invoice_number"), "amount": inv.get("taxable_amount")} for inv in missing_in_2b]
    b2b_subset = [{"id": rec["id"], "gstin": rec.get("supplier_gstin"), "inv_num": rec.get("invoice_number"), "amount": rec.get("taxable_value")} for rec in unmatched_2b]
    
    prompt = f"""
    You are an expert AI data reconciliation engine for Indian GST.
    I have a list of 'Purchase Register' invoices and a list of 'GSTR-2B' government records.
    They failed exact matching due to severe typos, OCR errors, or missing prefixes in invoice numbers or supplier names.
    Your task is to logically match PR invoices to GSTR-2B records using fuzzy entity resolution.
    
    Purchase Register (PR) Invoices:
    {json.dumps(pr_subset)}
    
    GSTR-2B Records:
    {json.dumps(b2b_subset)}
    
    Return ONLY a valid JSON array of objects. Each object should have:
    - "pr_invoice_id": The ID from the Purchase Register
    - "b2b_record_id": The ID from the GSTR-2B Records that it matches
    - "confidence_score": 0.0 to 1.0 indicating your confidence in the match
    - "reason": A brief 1-sentence reason why they match despite the typos
    
    Do NOT include markdown formatting like ```json.
    """
    
    import os
    from openai import AsyncOpenAI
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    gemini_client = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/") if GEMINI_API_KEY else None
    
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured for Deep Match.")
        
    try:
        response = await gemini_client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0
        )
        
        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```json"): result_text = result_text[7:]
        if result_text.endswith("```"): result_text = result_text[:-3]
        
        matches = json.loads(result_text)
        
        # Apply updates
        updates = []
        for match in matches:
            if match.get("confidence_score", 0) > 0.8:
                updates.append({
                    "id": match["pr_invoice_id"],
                    "recon_status": "matched"
                })
                
        if updates:
            # Use bulk update RPC
            # In deep match we might not have recon_period populated in updates yet, so we ensure it
            for u in updates:
                u['recon_period'] = period
            await supabase_client.rpc("bulk_update_invoices_recon", {"updates": updates}).execute()
                
        return {"status": "success", "message": f"AI Deep Match found {len(updates)} matches out of {len(missing_in_2b)} unmatched invoices.", "matches": matches}
        
    except Exception as e:
        print(f"Gemini Deep Match failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI Deep Match failed: {str(e)}")
