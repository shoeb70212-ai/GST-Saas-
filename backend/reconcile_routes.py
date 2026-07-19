import pandas as pd
import io
import asyncio
import calendar
import re
import json
import math
import os
import logging
from datetime import date
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, Form
import httpx
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

from collections import defaultdict
import rapidfuzz
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

router = APIRouter()


async def _verify_client_ownership_reconcile(token: str, client_id: str, user_id: str):
    """Verify that a client_id belongs to the authenticated user before reconcile operations."""
    async with httpx.AsyncClient() as http_client:
        client_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/clients?id=eq.{client_id}&user_id=eq.{user_id}&select=id",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if not client_resp.json():
            raise HTTPException(status_code=403, detail="Access denied: client not found")

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

def clean_str(s):
    """
    Normalizes invoice numbers and GSTINs by stripping whitespace, hyphens, 
    slashes, and stripping leading zeros from numeric sequences. 
    """
    if not s: return ""
    s = str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
    return re.sub(r'(\D)0+(\d)', r'\1\2', s)

@router.post("")
async def reconcile_gstr2b(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period: str = Form(...),
    tolerance: str = Form("1.0"),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    tol_val = float(tolerance)
    
    async with httpx.AsyncClient() as http_client:
        user_resp = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        user_id = user_resp.json().get("id")
    
    # Verify client ownership (fixes #14 — data leak prevention)
    await _verify_client_ownership_reconcile(token, client_id, user_id)
        
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
            
        if pd.isna(row.get(gstin_col)): continue
            
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
        fetch_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        old_records = fetch_resp.json() if fetch_resp.status_code == 200 else []

        await http_client.delete(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        
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
                
        if not insert_success and old_records:
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
        
    # Phase 1: Hash Map Grouping O(N)
    pr_by_gstin = defaultdict(list)
    b2b_by_gstin = defaultdict(list)
    
    for inv in pr_invoices:
        gstin = clean_str(inv.get('supplier_gstin'))
        pr_by_gstin[gstin].append(inv)
        
    for rec in records:
        gstin = clean_str(rec.get('supplier_gstin'))
        b2b_by_gstin[gstin].append(rec)

    updates = []
    
    # Phase 2: Reconciliation Engine
    for gstin, pr_list in pr_by_gstin.items():
        b2b_list = b2b_by_gstin.get(gstin, [])
        
        # Consolidation Check (O(N) Summation)
        sum_pr = sum(float(inv.get('taxable_amount') or 0) for inv in pr_list)
        sum_b2b = sum(float(rec.get('taxable_value') or 0) for rec in b2b_list)
        
        if len(pr_list) != len(b2b_list) and len(b2b_list) > 0:
            if abs(sum_pr - sum_b2b) <= tol_val:
                # Consolidation Detected! Flag all PRs in this group
                for inv in pr_list:
                    updates.append({
                        "id": inv['id'],
                        "recon_status": "mismatch",
                        "recon_period": period,
                        "error_message": f"Consolidation Detected: {len(pr_list)} PRs vs {len(b2b_list)} GSTR2B"
                    })
                continue # Skip 1-to-1 matching for this consolidated group
                
        # 1-to-1 Match Logic (Only for non-consolidated or mismatched groups)
        two_b_dict = {f"{clean_str(r['invoice_number'])}": r for r in b2b_list}
        
        for inv in pr_list:
            my_inv_num = clean_str(inv.get('invoice_number'))
            scanned_tax = float(inv.get('taxable_amount') or 0)
            
            best_match_key = None
            best_score = 0
            best_b2b_rec = None
            
            for b2b_inv_num, b2b_rec in two_b_dict.items():
                score = rapidfuzz.fuzz.ratio(my_inv_num, b2b_inv_num)
                if score > best_score:
                    best_score = score
                    best_match_key = b2b_inv_num
                    best_b2b_rec = b2b_rec
                    
            if best_match_key and best_score >= 75.0:
                b2b_tax = float(best_b2b_rec['taxable_value'] or 0)
                
                # Use User's Configurable Tolerance
                if best_score >= 90.0 and abs(scanned_tax - b2b_tax) <= tol_val:
                    status = "matched"
                    error_msg = None
                else:
                    status = "mismatch"
                    error_msg = "Amount/Invoice Mismatch"
                    
                updates.append({
                    "id": inv['id'],
                    "recon_status": status,
                    "recon_period": period,
                    "error_message": error_msg
                })
                del two_b_dict[best_match_key]
            else:
                if not inv.get('recon_status') or inv.get('recon_status') in ['unreconciled', 'missing_in_2b']:
                    updates.append({
                        "id": inv['id'],
                        "recon_status": "missing_in_2b",
                        "recon_period": period,
                        "error_message": None
                    })
                
    if updates:
        async with httpx.AsyncClient() as http_client:
            # Chunk the RPC updates as well to prevent huge payloads
            update_chunk_size = 500
            for i in range(0, len(updates), update_chunk_size):
                await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/bulk_update_invoices_recon",
                    headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={"updates": updates[i:i+update_chunk_size]}
                )
            
    return {"status": "success", "message": f"Reconciled {len(records)} records from 2B against {len(pr_invoices)} Purchase Register invoices using {tol_val} tolerance."}


@router.post("/deep-match")
async def deep_match_reconcile(
    client_id: str = Form(...),
    period: str = Form(...),
    tolerance: str = Form("1.0"),
    authorization: str = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    token = authorization.split(" ")[1]
    tol_val = float(tolerance)
    
    async with httpx.AsyncClient() as http_client:
        user_resp = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        user_id = user_resp.json().get("id")
    
    # Verify client ownership (fixes #14 — data leak prevention)
    await _verify_client_ownership_reconcile(token, client_id, user_id)
    
    async with httpx.AsyncClient() as http_client:
        # Fetch PR Invoices
        pr_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}&recon_period=eq.{period}&select=id,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_amount,total_amount,recon_status",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        pr_invoices = pr_resp.json() if pr_resp.status_code == 200 else []
        
        missing_in_2b = [inv for inv in pr_invoices if inv.get("recon_status") == "missing_in_2b"]
        matched_invoices = [inv for inv in pr_invoices if inv.get("recon_status") in ["matched", "mismatch"]]
        
        if not missing_in_2b:
            return {"status": "success", "message": "No unmatched Purchase Register invoices found for Deep Match."}
            
        # Fetch 2B records
        b2b_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        b2b_records = b2b_resp.json() if b2b_resp.status_code == 200 else []
        
        if not b2b_records:
            return {"status": "success", "message": "No GSTR-2B records found for this period."}
            
        matched_2b_keys = {f"{clean_str(inv.get('supplier_gstin'))}_{clean_str(inv.get('invoice_number'))}" for inv in matched_invoices}
        
        unmatched_2b = []
        for rec in b2b_records:
            key = f"{clean_str(rec.get('supplier_gstin'))}_{clean_str(rec.get('invoice_number'))}"
            if key not in matched_2b_keys:
                unmatched_2b.append(rec)
                
        if not unmatched_2b:
            return {"status": "success", "message": "No unmatched GSTR-2B records available for Deep Match."}
            
        total_items = len(missing_in_2b) + len(unmatched_2b)
        cost = max(5, math.ceil(total_items / 20) * 5)

        # Check credits and Deduct
        rpc_resp = await http_client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/decrement_credits",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"user_id_param": user_id, "amount": cost}
        )
        if rpc_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Internal error during credit deduction.")
        
        # Robust -1 insufficient credits check (fixes Bug #7 — fragile try/except ValueError)
        rpc_result = rpc_resp.json()
        if rpc_result == -1:
            raise HTTPException(status_code=402, detail="Insufficient credits for AI Deep Match.")
            
    # Prepare Gemini Payloads
    pr_subset = [{"id": inv["id"], "supplier": inv.get("supplier_name"), "gstin": inv.get("supplier_gstin"), "inv_num": inv.get("invoice_number"), "amount": inv.get("taxable_amount")} for inv in missing_in_2b]
    b2b_subset = [{"id": rec["id"], "gstin": rec.get("supplier_gstin"), "inv_num": rec.get("invoice_number"), "amount": rec.get("taxable_value")} for rec in unmatched_2b]
    
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    gemini_client = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/") if GEMINI_API_KEY else None
    
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured for Deep Match.")
        
    # AI Token Limit Protection: Chunk PR Invoices into batches of 50
    pr_chunks = [pr_subset[i:i + 50] for i in range(0, len(pr_subset), 50)]
    all_matches = []
    
    async def process_chunk(chunk):
        prompt = f"""
        You are an expert AI data reconciliation engine for Indian GST.
        I have a list of 'Purchase Register' invoices and a list of 'GSTR-2B' government records.
        They failed exact matching due to severe typos, OCR errors, or missing prefixes.
        Your task is to logically match PR invoices to GSTR-2B records using fuzzy entity resolution.
        
        The user has set an absolute tax discrepancy tolerance of ₹{tol_val}. You MAY match them if amounts are within this tolerance.
        
        Purchase Register (PR) Invoices:
        {json.dumps(chunk)}
        
        GSTR-2B Records:
        {json.dumps(b2b_subset)}
        
        Return ONLY a valid JSON array of objects. Each object should have:
        - "pr_invoice_id": The ID from the Purchase Register
        - "b2b_record_id": The ID from the GSTR-2B Records that it matches
        - "confidence_score": 0.0 to 1.0 indicating your confidence in the match
        - "reason": A brief 1-sentence reason why they match despite the typos
        
        Do NOT include markdown formatting like ```json.
        """
        try:
            response = await gemini_client.chat.completions.create(
                model="gemini-2.5-flash",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            
            result_text = response.choices[0].message.content.strip()
            if result_text.startswith("```json"): result_text = result_text[7:]
            if result_text.endswith("```"): result_text = result_text[:-3]
            
            return json.loads(result_text)
        except Exception as e:
            logger.warning(f"Chunk failed: {e}")
            return []

    # Process all chunks in parallel using asyncio.gather
    chunk_results = await asyncio.gather(*(process_chunk(chunk) for chunk in pr_chunks))
    for res in chunk_results:
        all_matches.extend(res)
        
    updates = []
    for match in all_matches:
        if match.get("confidence_score", 0) > 0.8:
            updates.append({
                "id": match["pr_invoice_id"],
                "recon_status": "matched",
                "recon_period": period,
                "error_message": None
            })
            
    if updates:
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/bulk_update_invoices_recon",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"updates": updates}
            )
            
    return {"status": "success", "message": f"AI Deep Match found {len(updates)} matches across {len(pr_chunks)} parallel processing chunks.", "matches": all_matches}
