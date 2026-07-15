# KhataLens — Future Roadmap & Pending Integrations

This document outlines the strategic roadmap for KhataLens, identifying the next sequence of major product evolutions after the successful launch of the Zero-Hallucination Bank Reconciliation and WhatsApp Ingestion pipelines.

## 1. Automated E2E Testing Pipeline CI/CD (Immediate Priority)
**The Problem:** We have created comprehensive Playwright tests and Pytest suites, but they only run locally.
**The Solution:** 
- Integrate GitHub Actions to run the full E2E Playwright test suite and backend Pytest suite on every pull request.
- Add branch protection rules to prevent merging code that breaks the reconciliation logic.

## 2. GSTR-2B Reconciliation & "AI Deep Match" (Next Feature)
**The Problem:** Currently, accountants must manually cross-reference the invoices they digitized against the government's GSTR-2B portal report to see which vendors failed to upload their bills (resulting in a loss of Input Tax Credit). Furthermore, matching is extremely difficult because human typos cause mismatches in invoice numbers.
**The Solution:** 
Extend our existing 2-Tier Bank Reconciliation architecture to GSTR-2B:
1. **Tier 1 (Deterministic):** Fast local matching (GSTIN + Invoice Number + Date). Clears ~70-80% at zero cost.
2. **Tier 2 (AI Deep Match):** Unmatched government rows and unmatched scanned invoices are sent to Gemini 2.5 Flash for "Fuzzy Matching / Entity Resolution" to logically link invoices despite heavy typos.

## 3. Real Monetization via Stripe/Razorpay
**The Problem:** We defined the Starter and Pro pricing tiers (₹999 and ₹2,499), but have no mechanism to accept real money.
**The Solution:** Integrate Razorpay (optimal for the Indian market) or Stripe.
- Create a subscription webhook that updates the `tier` and `credits` columns in the `profiles` table automatically.
- Restrict Tier 2 AI matching to Pro users.

## 4. Automated AI Expense Categorization
**The Problem:** We extract data perfectly, but the accountant still needs to manually assign an "Expense Category" (e.g., Office Supplies, IT Software) before importing to Tally.
**The Solution:** Add a lightweight, secondary AI pass that looks at the extracted `line_items` and suggests a standard accounting ledger category based on the client's past categorization history (RAG).

## 5. Vendor GSTIN Verification & KYC
**The Problem:** If a client claims ITC from a vendor whose GSTIN is cancelled, the client gets penalized.
**The Solution:** Integrate a cheap/free Indian GST API. When an invoice is scanned, ping the API with the `supplier_gstin` to verify its status (Active/Suspended/Cancelled) and display a warning badge on the dashboard.

## 6. The "Tax Liability Predictor" (Sales Import)
**The Problem:** Building an Invoice Generator from scratch puts us in direct competition with giants like Vyapar, Zoho, and Tally. 
**The Solution:** Instead of generating sales invoices, we allow them to **Import** their Sales Register. We instantly calculate: `(Total Sales Tax) - (Total Purchase ITC)` and display a massive dashboard widget: **"Estimated GST Cash Liability this Month: ₹14,500"**.
