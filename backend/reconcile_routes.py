import pandas as pd
import io
import calendar
import logging
import os
from datetime import date
from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Depends
from http_client import get_shared_client
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

from collections import defaultdict
from utils import verify_client_access, get_current_user
from match_utils import clean_str, match_pr_to_b2b

logger = logging.getLogger(__name__)

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

def _rpc_updates(raw_updates: list[dict]) -> list[dict]:
    """Strip matcher-only fields before bulk_update_invoices_recon."""
    return [
        {
            "id": u["id"],
            "recon_status": u["recon_status"],
            "recon_period": u.get("recon_period"),
            "error_message": u.get("error_message"),
        }
        for u in raw_updates
    ]

@router.post("")
async def reconcile_gstr2b(
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period: str = Form(...),
    tolerance: str = Form("1.0"),
    auth: dict = Depends(get_current_user),
):
    user_id = auth["user_id"]
    token = auth["token"]
    tol_val = float(tolerance)

    # Firm-wide org access via has_client_access (not clients.user_id owner-only)
    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

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
        
    async with get_shared_client() as http_client:
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
            f"&select=id,supplier_gstin,invoice_number,invoice_date,taxable_amount,total_amount,recon_status,recon_period"
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
    
    # Phase 2: Reconciliation Engine (deterministic multi-pass)
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
                
        updates.extend(
            match_pr_to_b2b(
                pr_list,
                b2b_list,
                amount_tol=tol_val,
                period=period,
                allow_cross_gstin=False,
            )
        )

    missing_in_2b = sum(1 for u in updates if u.get("recon_status") == "missing_in_2b")
    matched_n = sum(1 for u in updates if u.get("recon_status") == "matched")
    mismatch_n = sum(1 for u in updates if u.get("recon_status") == "mismatch")
    # 2B rows not paired to any PR (approx: leftover after greedy 1:1 within GSTIN groups)
    paired_pr = matched_n + mismatch_n
    missing_in_pr = max(0, len(records) - paired_pr)
                
    if updates:
        async with get_shared_client() as http_client:
            # Chunk the RPC updates as well to prevent huge payloads
            update_chunk_size = 500
            rpc_payload = _rpc_updates(updates)
            for i in range(0, len(rpc_payload), update_chunk_size):
                await http_client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/bulk_update_invoices_recon",
                    headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={"updates": rpc_payload[i:i+update_chunk_size]}
                )
            try:
                from itc_risk import recompute_itc_risk

                await recompute_itc_risk(
                    http_client,
                    token=token,
                    client_id=client_id,
                    period=period,
                )
            except Exception as e:
                logger.warning("ITC risk recompute after GSTR reconcile failed: %s", e)
            
    return {
        "status": "success",
        "engine": "rules",
        "message": (
            f"Reconciled {len(records)} records from 2B against {len(pr_invoices)} "
            f"Purchase Register invoices using {tol_val} tolerance."
        ),
        "summary": {
            "matched": matched_n,
            "mismatch": mismatch_n,
            "missing_in_2b": missing_in_2b,
            "missing_in_pr": missing_in_pr,
            "gstr2b_count": len(records),
            "pr_count": len(pr_invoices),
        },
    }


@router.post("/deep-match")
async def deep_match_reconcile(
    client_id: str = Form(...),
    period: str = Form(...),
    tolerance: str = Form("1.0"),
    auth: dict = Depends(get_current_user),
):
    """Deterministic multi-pass match (no LLM / no credits). Endpoint name kept for FE compat."""
    token = auth["token"]
    tol_val = float(tolerance)

    sc = auth["supabase_client"]
    await verify_client_access(sc, client_id)

    async with get_shared_client() as http_client:
        pr_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/invoices?client_id=eq.{client_id}&recon_period=eq.{period}&select=id,supplier_name,supplier_gstin,invoice_number,invoice_date,taxable_amount,total_amount,recon_status",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        pr_invoices = pr_resp.json() if pr_resp.status_code == 200 else []

        missing_in_2b = [inv for inv in pr_invoices if inv.get("recon_status") == "missing_in_2b"]
        matched_invoices = [inv for inv in pr_invoices if inv.get("recon_status") in ["matched", "mismatch"]]

        if not missing_in_2b:
            return {
                "status": "success",
                "engine": "rules",
                "message": "No unmatched Purchase Register invoices found for Smart Match.",
                "matches": [],
            }

        b2b_resp = await http_client.get(
            f"{SUPABASE_URL}/rest/v1/gstr2b_records?client_id=eq.{client_id}&period=eq.{period}",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
        )
        b2b_records = b2b_resp.json() if b2b_resp.status_code == 200 else []

        if not b2b_records:
            return {
                "status": "success",
                "engine": "rules",
                "message": "No GSTR-2B records found for this period.",
                "matches": [],
            }

        matched_2b_keys = {
            f"{clean_str(inv.get('supplier_gstin'))}_{clean_str(inv.get('invoice_number'))}"
            for inv in matched_invoices
        }

        unmatched_2b = []
        for rec in b2b_records:
            key = f"{clean_str(rec.get('supplier_gstin'))}_{clean_str(rec.get('invoice_number'))}"
            if key not in matched_2b_keys:
                unmatched_2b.append(rec)

        if not unmatched_2b:
            return {
                "status": "success",
                "engine": "rules",
                "message": "No unmatched GSTR-2B records available for Smart Match.",
                "matches": [],
            }

        # Cross-GSTIN allowed here (PAN-level) — this is the "deep" pass
        raw_updates = match_pr_to_b2b(
            missing_in_2b,
            unmatched_2b,
            amount_tol=tol_val,
            period=period,
            allow_cross_gstin=True,
        )
        updates = [
            u for u in raw_updates
            if u.get("recon_status") in ("matched", "mismatch")
        ]

        matches = [
            {
                "pr_invoice_id": u["id"],
                "reason_code": u.get("reason_code"),
                "recon_status": u["recon_status"],
                "confidence_score": 1.0 if u["recon_status"] == "matched" else 0.85,
            }
            for u in updates
        ]

        if updates:
            await http_client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/bulk_update_invoices_recon",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"updates": _rpc_updates(updates)},
            )
            try:
                from itc_risk import recompute_itc_risk

                await recompute_itc_risk(
                    http_client,
                    token=token,
                    client_id=client_id,
                    period=period,
                )
            except Exception as e:
                logger.warning("ITC risk recompute after smart match failed: %s", e)

        return {
            "status": "success",
            "engine": "rules",
            "message": f"Smart Match (rules) found {len(updates)} updates.",
            "matches": matches,
        }
