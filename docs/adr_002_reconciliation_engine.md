# Architecture Decision Record 002: The Hybrid Reconciliation Engine

## Status
Accepted

## Context
Bank reconciliation is a highly tedious task for CAs. They must match thousands of bank statement rows to purchase and sales invoices. 
Initially, we considered sending all invoices and bank statement data simultaneously to Gemini to have the AI figure out all the matches. However, this approach presented several critical issues:
1. **Hallucination Risk:** Generative AI is inherently bad at strict mathematics. It might match a ₹1,005.50 payment to a ₹1,005.00 invoice, which causes a 50 paise accounting discrepancy that will fail a strict tax audit.
2. **Cost:** Sending thousands of rows of bank statements + hundreds of invoices to an LLM every time a user clicks "Reconcile" would consume massive amounts of tokens, destroying our unit economics.
3. **Latency:** Processing that much data in a single prompt takes 30-60 seconds, leading to a poor user experience.

## Decision
We decided to implement a **Hybrid 2-Tier Reconciliation Architecture** inside the FastAPI backend, strictly adhering to a "Human-in-the-Loop" approval flow.

### Tier 1: Deterministic Engine (Python Math)
- The backend first runs a highly optimized Python script that loops through unmatched bank transactions and unmatched invoices.
- It looks for exact date matches (within a configurable ±3 day tolerance window) and exact amount matches (within a ±₹1.00 tolerance for bank rounding).
- If it finds a 1:1 match, it creates a record in `reconciliation_suggestions` with `match_type = 'EXACT'`.
- **Cost:** $0.00.
- **Latency:** ~50 milliseconds.

### Tier 2: AI Fuzzy Match Engine (Gemini 2.5 Flash)
- Only the records that *failed* the Tier 1 deterministic check are serialized and sent to Gemini.
- Gemini is prompted to perform "entity resolution" (e.g., realizing that a bank narrative saying "NEFT-AMZ INDIA" corresponds to the invoice from "Amazon Seller Services Pvt Ltd").
- It creates a record in `reconciliation_suggestions` with `match_type = 'AI_FUZZY'`.
- **Cost:** Fraction of a cent per batch, because the payload is reduced by 70% (thanks to Tier 1 clearing the easy matches).

### The Human-in-the-Loop (Zero Hallucination Mandate)
Neither Tier 1 nor Tier 2 is allowed to alter the actual ledger balance automatically. They both insert records into `reconciliation_suggestions` with a status of `SUGGESTED`.
The frontend `BankReconcilePage.tsx` fetches these suggestions and displays them in a split-view UI. The CA must explicitly review and click **"Approve"**. Only upon approval does an RPC call execute to finalize the match in the database.

## Consequences
**Positive:**
- Complete elimination of mathematical hallucination errors in the final ledger.
- Drastic reduction in LLM API costs.
- Extremely high user trust, as accountants feel they are in control rather than being replaced by a black box.

**Negative:**
- Increased backend complexity (maintaining two separate matching algorithms).
- Required building a complex "Undo" state machine in case an accountant accidentally approves the wrong suggestion.
