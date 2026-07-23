"""
Bank AP reconciliation: Tier-1 exact + Tier-2 deterministic rules (no LLM by default).

Set BANK_AI_MATCH=1 to re-enable optional GPT Tier-2 (legacy).
"""
from __future__ import annotations

import os
import json
from openai import AsyncOpenAI
from supabase import create_async_client
from pydantic import BaseModel, Field

from match_utils import match_bank_leftovers

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
BANK_AI_MATCH = os.getenv("BANK_AI_MATCH", "0").strip().lower() in ("1", "true", "yes")

if OPENAI_API_KEY:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
else:
    client = None

class ReconciliationSuggestion(BaseModel):
    bank_transaction_id: str
    invoice_id: str
    match_type: str = Field(description="'EXACT', 'PARTIAL', 'ADVANCE', or 'FIFO'")
    allocated_amount: float
    confidence_score: float = Field(description="0.0 to 1.0 confidence")

class AIReconciliationResult(BaseModel):
    suggestions: list[ReconciliationSuggestion]

async def run_ai_matching_engine(client_id: str, user_id: str):
    SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
    sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)

    # Fetch Client Settings
    client_resp = await sc.table("clients").select("auto_approve_exact_matches").eq("id", client_id).execute()
    auto_approve = False
    if client_resp.data:
        auto_approve = client_resp.data[0].get("auto_approve_exact_matches", False)

    stmts_resp = await sc.table("bank_statements").select("id").eq("client_id", client_id).execute()
    stmt_ids = [s["id"] for s in stmts_resp.data]
    if not stmt_ids:
        return {"status": "success", "message": "No bank statements found.", "suggestions_created": 0, "engine": "rules"}

    bank_txns_resp = await sc.table("bank_transactions")\
        .select("id, txn_date, description, reference_no, withdrawal, deposit, allocated_amount")\
        .in_("statement_id", stmt_ids)\
        .eq("is_fully_allocated", False)\
        .eq("has_math_error", False)\
        .eq("needs_manual_review", False)\
        .execute()
    
    unallocated_txns = bank_txns_resp.data

    invoices_resp = await sc.table("invoices")\
        .select("id, supplier_name, invoice_number, total_amount, paid_amount, invoice_date")\
        .eq("client_id", client_id)\
        .neq("payment_status", "PAID")\
        .execute()
    
    unpaid_invoices = invoices_resp.data

    if not unallocated_txns or not unpaid_invoices:
        return {"status": "success", "message": "Nothing to reconcile.", "suggestions_created": 0, "engine": "rules"}

    suggestions_created = 0
    leftover_txns = []
    used_invoice_ids: set[str] = set()

    # TIER 1: DETERMINISTIC EXACT MATCHING (Python)
    for txn in unallocated_txns:
        if not txn.get("withdrawal"):
            leftover_txns.append(txn)
            continue
            
        remaining_bank_amt = float(txn.get("withdrawal") or 0.0) - float(txn.get("allocated_amount") or 0.0)
        if remaining_bank_amt <= 0:
            continue

        exact_match_found = False
        for inv in unpaid_invoices:
            if inv["id"] in used_invoice_ids:
                continue
            remaining_inv_amt = float(inv.get("total_amount") or 0.0) - float(inv.get("paid_amount") or 0.0)
            
            if abs(remaining_bank_amt - remaining_inv_amt) < 1.0:
                sup_name = (inv.get("supplier_name") or "").lower().strip()
                txn_desc = (txn.get("description") or "").lower().strip()
                
                is_valid_string_match = False
                if sup_name and txn_desc:
                    if len(sup_name) < 4:
                        is_valid_string_match = (sup_name == txn_desc)
                    else:
                        is_valid_string_match = (sup_name in txn_desc or txn_desc in sup_name)

                if is_valid_string_match:
                    status = "SUGGESTED"
                    
                    await sc.table("reconciliation_matches").insert({
                        "client_id": client_id,
                        "invoice_id": inv["id"],
                        "bank_transaction_id": txn["id"],
                        "match_type": "EXACT",
                        "allocated_amount": remaining_inv_amt,
                        "status": status,
                        "created_by": "RULES"
                    }).execute()
                    
                    if auto_approve:
                        try:
                            match_resp = await sc.table("reconciliation_matches").select("id").eq("bank_transaction_id", txn["id"]).eq("invoice_id", inv["id"]).order("created_at", desc=True).limit(1).execute()
                            if match_resp.data:
                                await sc.rpc("approve_reconciliation_match", {"match_id_param": match_resp.data[0]["id"]}).execute()
                        except Exception as e:
                            print(f"Auto-approve RPC failed: {e}")
                    
                    suggestions_created += 1
                    used_invoice_ids.add(inv["id"])
                    exact_match_found = True
                    break
        
        if not exact_match_found:
            leftover_txns.append(txn)

    # TIER 2: DETERMINISTIC RULES (default) — narration / amount / date / UTR
    remaining_invoices = [i for i in unpaid_invoices if i["id"] not in used_invoice_ids]
    rule_suggestions = match_bank_leftovers(leftover_txns, remaining_invoices, amount_tol=1.0)
    matched_txn_ids = set()
    for sugg in rule_suggestions:
        await sc.table("reconciliation_matches").insert({
            "client_id": client_id,
            "invoice_id": sugg["invoice_id"],
            "bank_transaction_id": sugg["bank_transaction_id"],
            "match_type": sugg["match_type"],
            "allocated_amount": sugg["allocated_amount"],
            "status": "SUGGESTED",
            "created_by": "RULES",
        }).execute()
        suggestions_created += 1
        matched_txn_ids.add(sugg["bank_transaction_id"])
        used_invoice_ids.add(sugg["invoice_id"])

    # Optional legacy GPT Tier-2 (off by default)
    still_leftover = [t for t in leftover_txns if t["id"] not in matched_txn_ids]
    if BANK_AI_MATCH and still_leftover and client:
        chunk_size = 20
        simple_invs = [
            {
                "id": i["id"],
                "supplier": i["supplier_name"],
                "due": float(i["total_amount"]) - float(i["paid_amount"]),
                "date": i["invoice_date"],
            }
            for i in unpaid_invoices
            if i["id"] not in used_invoice_ids
        ]
        
        for idx in range(0, len(still_leftover), chunk_size):
            chunk_txns = still_leftover[idx:idx + chunk_size]
            simple_txns = [
                {
                    "id": t["id"],
                    "desc": t["description"],
                    "amount": float(t["withdrawal"]) - float(t["allocated_amount"]),
                    "date": t["txn_date"],
                }
                for t in chunk_txns
            ]
            
            prompt = f"""
            You are an expert AI Reconciliation Engine.
            Match the provided bank transactions (withdrawals) to the unpaid vendor invoices.
            Use fuzzy matching for vendor names and narrations.
            If a bank transaction amount is less than the invoice due amount, it is a 'PARTIAL' payment.
            Only suggest a match if confidence is > 0.8.
            
            Bank Transactions: {json.dumps(simple_txns)}
            Unpaid Invoices: {json.dumps(simple_invs)}
            """

            try:
                response = await client.beta.chat.completions.parse(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format=AIReconciliationResult,
                )
                
                ai_results = response.choices[0].message.parsed
                
                for sugg in ai_results.suggestions:
                    if sugg.confidence_score > 0.8:
                        await sc.table("reconciliation_matches").insert({
                            "client_id": client_id,
                            "invoice_id": sugg.invoice_id,
                            "bank_transaction_id": sugg.bank_transaction_id,
                            "match_type": sugg.match_type,
                            "allocated_amount": sugg.allocated_amount,
                            "status": "SUGGESTED",
                            "created_by": "AI"
                        }).execute()
                        suggestions_created += 1
            except Exception as e:
                print(f"AI Matching failed on chunk {idx}: {e}")

    return {
        "status": "success",
        "message": "Engine run complete.",
        "suggestions_created": suggestions_created,
        "engine": "rules",
        "bank_ai_match": BANK_AI_MATCH,
    }
