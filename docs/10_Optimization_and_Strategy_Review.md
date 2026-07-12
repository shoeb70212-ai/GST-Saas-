# KhataLens Strategy & Optimization Review

This document serves as the master blueprint for the next phase of KhataLens development. It evaluates various AI-suggested features and optimizations against our core goal: **maximizing value for Indian Chartered Accountants while keeping AI API costs as close to zero as possible.**

---

## 🚀 Priority Features to ADD (High Value, Zero/Low Cost)

These features must be implemented in the next session as they directly impact the core workflow of a CA and provide a significant competitive moat against enterprise tools like ClearTax.

### 1. TallyPrime XML Export (The Killer Feature)
- **Why we need it:** CAs currently export to Excel, but they still have to manually map and import that Excel into Tally. Generating a native `TallyPrime XML` voucher file means 1-click import into Tally. This collapses 4,500 manual entries a month to zero.
- **Why it's feasible:** Tally's XML format is public and royalty-free. It requires 0 extra AI cost—just backend string templating of the extracted JSON.
- **Priority:** Critical (Moat feature).

### 2. Duplicate Invoice Blocker
- **Why we need it:** Currently, a CA could accidentally scan the same invoice PDF twice, leading to inflated ITC claims and client ledger errors. 
- **Implementation:** A simple PostgreSQL `UNIQUE(client_id, supplier_gstin, invoice_number)` constraint. 
- **Priority:** Immediate / Critical.

### 3. Cross-Period Reconciliation Logic (GSTR-2B)
- **Why we need it:** The #1 complaint about automated reconciliation tools is that they flag "timing differences" (e.g., March invoice filed in April's GSTR-2B) as mismatches. 
- **Implementation:** Our matching engine will include a +1 month grace period logic. If an invoice matches perfectly but is off by one period, it is classified as a `timing_difference` rather than an error.
- **Priority:** Immediate (To be built alongside the GSTR-2B matching engine).

### 4. Backend Confidence State Parsing
- **Why we need it:** Returning raw decimals (e.g., `Confidence_Score: 84`) to the frontend encourages users to "game" the system. 
- **Implementation:** The FastAPI backend will evaluate the score and return an actionable status (`auto_accepted`, `needs_review`, `needs_retry`).
- **Priority:** High.

### 5. Retry Limits (`retry_count`)
- **Why we need it:** To prevent users from continuously uploading the same blurry image and burning through their credits (or our API budget).
- **Implementation:** Add a `retry_count` column to the DB. Cap retries at 3 per invoice before forcing the user to manually enter the data.
- **Priority:** High.

### 6. Anomaly Detection (Post-2024 Scrutiny)
- **Why we need it:** GSTN has tightened risk-based scrutiny. CAs get notices if their clients claim ITC from shell companies. 
- **Implementation:** Zero AI cost. Pure SQL statistical queries (Z-score) on per-supplier invoice amounts. If a supplier suddenly invoices 3x their normal amount, we flag it as an anomaly.
- **Priority:** Medium (Post-GSTR-2B).

---

## ❌ Features to AVOID (Cost Bloat / Low Feasibility)

These features were suggested but have been rejected after technical review due to high API costs, technical impossibility, or legal risk.

### 1. Context Caching for System Prompts
- **The Suggestion:** Cache the Gemini extraction prompt to save 40% on API costs.
- **Why to Avoid:** **Technically impossible for our setup.** Google Gemini requires a *minimum* of 32,768 tokens to utilize context caching. Our system prompt is ~50 tokens. Furthermore, Gemini 2.5 Flash is already incredibly cheap (~₹0.03 per invoice), so the marginal savings do not justify architectural complexity.

### 2. Per-Field AI Confidence Scores
- **The Suggestion:** Ask Gemini to return a nested object for every field indicating its specific confidence (e.g., `{"value": "123", "confidence": 0.9}`).
- **Why to Avoid:** This requires changing our Structured Output schema to deeply nested objects, which will **double or triple our output token usage**. It destroys our cost-control strategy for a minor UX improvement. The current document-level score is sufficient.

### 3. Supplier Filing Health Check (Free GSTN API)
- **The Suggestion:** Automatically ping the GST portal to check if the supplier actually filed their GSTR-1.
- **Why to Avoid:** There is no easily accessible "free" automated API for this. GSTN requires CAPTCHAs for public searches. Automating it requires a GSP (GST Suvidha Provider) license or a paid 3rd-party API (like Signzy), which costs money per request.

### 4. Automated HSN/SAC Suggestion
- **The Suggestion:** Use the AI to guess the HSN code if it's missing from the invoice.
- **Why to Avoid:** High legal and compliance risk. If the AI guesses the wrong HSN code and the CA blindly accepts it, it results in GSTR-1 rejections and scrutiny notices. We should strictly extract what is on the paper, not guess tax codes.

---

## 📈 Strategic Pivot: Pricing Model

### Current Strategy: Credit Packs
- Currently, users get 100 free credits, deducting 1 credit per scan.
- Works well for small business owners but introduces friction for CA firms who process 4,000+ invoices a month.

### Proposed Strategy: Flat Subscription (SaaS)
- **The Pivot:** Move to a "Per Client Seat" subscription model. 
- **The Math:** 
  - AI extraction costs ~₹0.03 per invoice.
  - A CA with 10 clients processes ~1,500 invoices/month = ₹45 in AI costs.
  - If we charge **₹299/month**, our gross margin is >80%.
- **The Benefit:** CAs hate variable metered pricing. Offering them a flat monthly fee for "unlimited scans" (capped by fair usage policies) removes purchase friction and guarantees recurring revenue.

---

## ⏳ Pending / Unfinished Items from Phase 1

Before we start Phase 2, the following technical debt items must be cleared:

1. **Test Atomic Credits:** We updated `main.py` to use an RPC call for credit deduction, but it needs to be end-to-end tested with a real upload to ensure the Supabase decrement works perfectly.
2. **Review RLS Policies:** Ensure the new `gstr2b_records` table has perfectly airtight Row Level Security so clients never see other clients' financial data.
3. **Frontend Alert Testing:** The new `<AlertCircle>` and `<AlertTriangle>` warnings in `ScanPage.tsx` need to be visually verified by triggering a low-confidence scan.
