# LedgerLens — Future Roadmap & Pending Integrations

This document outlines the features that were discussed and brainstormed but explicitly parked until after the initial Beta test completes.

## 1. GSTR-2B Reconciliation & "AI Deep Match" (High Priority)
**The Problem:** Currently, accountants must manually cross-reference the invoices they digitized against the government's GSTR-2B portal report to see which vendors failed to upload their bills (resulting in a loss of Input Tax Credit). Furthermore, matching is extremely difficult because human typos cause mismatches in invoice numbers (e.g., `INV/24/01` vs `INV-24-01`) and supplier names.
**The Solution (Hybrid 2-Step Approach):** 
1. **Step 1: Free Deterministic Pass ($0 Cost)**
   Accountants upload the GSTR-2B JSON/Excel file downloaded from the government portal. The frontend runs a fast, deterministic local matching algorithm (GSTIN + Invoice Number + Date). This instantly clears ~70-80% of exact matches at zero cost.
2. **Step 2: Premium "AI Deep Match" (Monetization Lever)**
   For the remaining 20% of unmatched invoices, a premium button appears: **"✨ AI Deep Match (Costs X Credits)"**.
   When clicked, the unmatched government rows and unmatched scanned invoices are sent to Gemini 2.5 Flash. The AI is prompted to perform "Fuzzy Matching / Entity Resolution" to logically link invoices despite heavy typos or formatting differences.
   *Why this works:* It solves a deeply painful manual task for the accountant, justifies spending credits, and keeps API costs low because the AI only processes the 20% edge cases, not the entire dataset.

## 2. Real Monetization via Razorpay
**The Problem:** The app currently gives 100 free credits but has no mechanism to accept real money when those run out.
**The Solution:** Integrate Razorpay (optimal for the Indian market).
- Create a pricing page.
- Allow purchase of prepaid "Scan Bundles" (e.g., ₹999 for 1000 scans).
- The payment webhook will automatically update the `credits` column in the `profiles` table.

## 3. Bulk ZIP Upload Processing
**The Problem:** The current drag-and-drop handles a few PDFs well, but accountants often receive a ZIP file containing 200+ invoices at the end of the month.
**The Solution:** 
- Allow uploading a `.zip` file.
- Move the Gemini AI processing to a background Web Worker or a serverless queue.
- Send an in-app notification when the bulk extraction completes.

## 4. Automated AI Expense Categorization
**The Problem:** We extract data perfectly, but the accountant still needs to manually assign an "Expense Category" (e.g., Office Supplies, IT Software) before importing to Tally.
**The Solution:** Add a lightweight, secondary AI pass that looks at the extracted `line_items` and suggests a standard accounting ledger category.

## 5. Vendor GSTIN Verification & KYC
**The Problem:** If a client claims ITC from a vendor whose GSTIN is cancelled, the client gets penalized.
**The Solution:** Integrate a cheap/free Indian GST API. When an invoice is scanned, ping the API with the `supplier_gstin` to verify its status (Active/Suspended/Cancelled) and display a warning badge on the dashboard.
