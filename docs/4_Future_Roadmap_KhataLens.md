# KhataLens — Future Roadmap & Pending Integrations

This document outlines the features that were discussed and brainstormed but explicitly parked until after the initial Beta test completes.

## 🚨 IMMEDIATE PENDING TASK (Next Session)
**Task:** Configure the GitHub Secret for the keep-alive workflow.
- **Action Required:** Go to GitHub Repository Settings -> Secrets and variables -> Actions.
- **Secret Name:** `RENDER_BACKEND_URL`
- **Secret Value:** The root URL of the Render backend (e.g., `https://your-backend-name.onrender.com/`).
*Once added, the GitHub Action will automatically keep the backend awake 24/7.*

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

## 6. The Collaboration Workflow (Network Effect)
**The Problem:** Currently, business owners just email a folder of PDFs or WhatsApp images to their accountants, creating chaos, missing files, and data entry nightmares.
**The Solution:** Build a seamless data handoff pipeline between the two major roles:
1. **The Business Owner (Direct User):** Uses the app on their phone to scan bills as they receive them. Clicks a button: *"Send to Accountant"*.
2. **The Accountant:** Logs in, receives the digital stack in their "Inbox", verifies the AI extracted data, and exports it directly to Tally or the GST portal.
*Why this is a game-changer:* This introduces a **Viral Loop**. If one Accountant signs up, they will ask all 50 of their business clients to download the app to send them data. Your user base multiplies organically!

## 7. The "Tax Liability Predictor" (Sales Import)
**The Problem:** Building an Invoice Generator from scratch puts us in direct competition with giants like Vyapar, Zoho, and Tally. The market is too crowded. However, business owners always want to know: *"How much GST do I have to pay in cash this month?"*
**The Solution:** Instead of generating sales invoices, we allow them to **Import** their Sales Register (a simple Excel export from whatever billing software they currently use). 
*   We already have their **Purchase ITC** (from our AI scans).
*   We import their **Sales Tax Collected** (from the Excel).
*   The frontend ($0 cost) instantly calculates: `(Total Sales Tax) - (Total Purchase ITC)`.
*   We display a massive, beautiful dashboard widget: **"Estimated GST Cash Liability this Month: ₹14,500"**.
*   This delivers massive value to the business owner, hooking them to the app, without forcing them to switch away from their primary billing software.

## 8. Intentional Omissions (Out of Scope for MVP)
**The Problem:** Auditors or new developers may flag the absence of **Section 43B(h) MSME Deduction-Loss Warnings** or **180-Day Rule 37 ITC Reversal Deadlines** as "missing features."
**The Reality:** These are intentionally omitted. Both of these compliance rules require knowing the **exact date the invoice was paid**. Because KhataLens MVP is an invoice data extraction and reconciliation tool—not a full ERP with live bank-feed integrations—we do not possess payment dates. 
**The Solution:** These features are firmly parked until a future roadmap phase where KhataLens integrates directly with banking APIs or ERP systems to sync live payment statuses.
