# LedgerLens — Future Roadmap & Pending Integrations

This document outlines the features that were discussed and brainstormed but explicitly parked until after the initial Beta test completes.

## 1. GSTR-2B Reconciliation (High Priority)
**The Problem:** Currently, accountants must manually cross-reference the invoices they digitized against the government's GSTR-2B portal report to see which vendors failed to upload their bills (resulting in a loss of Input Tax Credit).
**The Solution:** Build an upload portal where accountants can drop the GSTR-2B JSON/Excel file. LedgerLens will auto-match (using GSTIN + Invoice Number + Date) against the scanned invoices and highlight:
- Missing Invoices
- Mismatched Taxable Amounts
- ITC at Risk

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
