# Phase 2: Technical Feature Specifications

This document outlines the detailed architecture, workflows, and technical requirements for the upcoming high-priority features in KhataLens.

---

## 1. GSTR-2B Reconciliation Engine (Highest Priority)

**Objective:** Allow accountants to upload government-provided GSTR-2B Excel files and automatically reconcile them against the AI-scanned physical invoices to identify missing Input Tax Credit (ITC) or mismatched amounts.

### 1.1 Database Schema (Already Implemented)
- **Table:** `gstr2b_records`
- **Columns:** `id`, `user_id`, `client_id`, `period` (e.g., "032025" for March 2025), `supplier_gstin`, `invoice_number`, `invoice_date`, `taxable_value`, `igst`, `cgst`, `sgst`, `itc_available`, `raw_json`.
- **Invoices Table Updates:** Added `recon_status` (`unreconciled`, `matched`, `mismatch`, `missing_in_2b`, `missing_in_pr`) and `recon_period`.

### 1.2 Frontend Workflow
1. **Upload UI:** A new `ReconciliationPage.tsx` where accountants select a `client_id` and a `period` (Month/Year).
2. **File Drop:** A dropzone strictly accepting `.xlsx` or `.csv` (standard GSTR-2B format).
3. **Dashboard:** A split-view dashboard showing:
   - **Matched:** Green list of invoices where GSTR-2B data exactly matches scanned data.
   - **Mismatches:** Yellow list showing discrepancies (e.g., Scanned Taxable = ₹10,000, 2B Taxable = ₹9,000).
   - **Missing in 2B (PR Only):** Red list of physical invoices scanned but NOT uploaded by the supplier (ITC at risk).
   - **Missing in PR (2B Only):** Blue list of invoices in the government portal that the accountant hasn't received physical copies for.

### 1.3 Backend Workflow (`/api/reconcile`)
1. **Parsing:** The FastAPI backend receives the Excel file, reads the specific columns (B2B sheets), and bulk inserts the rows into `gstr2b_records`.
2. **Matching Engine:**
   - **Step 1 (Exact Match):** Query `invoices` where `supplier_gstin` AND `invoice_number` perfectly match the 2B records.
   - **Step 2 (Amount Validation):** Compare `taxable_amount` and `gst_amount`. If `abs(scanned - 2b) < 1.00` (allow ₹1 rounding), set `recon_status = 'matched'`. If outside tolerance, set `recon_status = 'mismatch'`.
   - **Step 3 (Orphans):** 
     - Any 2B record without a corresponding invoice gets flagged as `missing_in_pr`.
     - Any scanned invoice for that period without a 2B record gets flagged as `missing_in_2b`.
3. **Database Update:** Batch update the `invoices` table with the new `recon_status`.

---

## 2. Monetization & Payment Gateway (Razorpay/Stripe)

**Objective:** Transition from the 100 free credits model to a paid model where accountants can purchase "Scan Bundles".

### 2.1 Pricing Strategy
- **Free Tier:** 100 credits on signup (Currently active via Supabase DB Trigger).
- **Pro Bundle:** ₹999 for 1,000 credits.
- **Enterprise Bundle:** ₹4,499 for 5,000 credits.

### 2.2 Frontend Workflow
1. **Wallet UI:** A `WalletPage.tsx` showing current credit balance and a "Recharge" button.
2. **Checkout:** Clicking "Recharge" opens a Razorpay modal (for Indian users) or Stripe checkout.
3. **Success State:** Upon successful payment, poll the backend to confirm the credit update, then show a success confetti animation.

### 2.3 Backend Workflow
1. **Order Creation:** `/api/create-order` endpoint that creates a Razorpay Order ID securely on the backend and sends it to the frontend.
2. **Webhook Listener:** A publicly exposed `/api/webhooks/payment` endpoint.
   - Listens for `payment.captured` (Razorpay) or `checkout.session.completed` (Stripe).
   - **Security:** Verifies the webhook signature using the secret key.
3. **Atomic DB Update:** 
   - Executes an RPC call: `UPDATE profiles SET credits = credits + {bundle_amount} WHERE id = {user_id}`.
   - Records the transaction in a new `transactions` table (Columns: `id`, `user_id`, `amount_paid`, `credits_added`, `payment_id`, `status`).

---

## 3. Bulk ZIP Uploads (Async Processing)

**Objective:** Save accountants time by allowing them to upload 50-100 invoices in a single `.zip` file rather than scanning one by one.

### 3.1 Architecture Shift
Currently, the `/api/scan` endpoint processes images synchronously (waits for Gemini to finish and returns the data). For ZIP files, this will cause HTTP timeouts. We need an asynchronous architecture.

### 3.2 Frontend Workflow
1. **Upload:** User drops a `.zip` file.
2. **Progress UI:** A persistent progress bar appears in the sidebar or dashboard (e.g., "Processing Batch: 12/50 Invoices").
3. **Notification:** A toast notification fires when the entire batch is complete.

### 3.3 Backend Workflow (Task Queue)
1. **Ingestion Endpoint (`/api/upload-batch`):** 
   - Unzips the file in memory.
   - Uploads all images to a Supabase Storage Bucket (e.g., `batch_processing_queue`).
   - Inserts 50 "pending" rows into the `invoices` table with a status column `processing_status = 'pending'`.
   - Returns a `batch_id` to the frontend immediately.
2. **Background Worker (Celery / Redis / BackgroundTasks):**
   - A background process picks up the pending images one by one.
   - Deducts 1 credit per image atomically.
   - Calls the Gemini API.
   - Updates the database row from `pending` to `completed` and fills in the extracted JSON data.

---

## 4. Automated AI Expense Categorization

**Objective:** Reduce manual data entry further by guessing the accounting ledger category (e.g., "Travel", "Office Supplies", "IT Software") based on the invoice line items.

### 4.1 Implementation Details
- **Trigger:** This happens during the primary invoice scan.
- **Prompt Engineering:** We update the Gemini prompt in `main.py` to include a new requested field: 
  `"Suggested_Category": "Choose one of [Office Supplies, Travel & Meals, IT Software & Hosting, Professional Fees, Raw Materials, Utilities, Miscellaneous] based on the line items."`
- **Frontend Integration:** Add a new dropdown column in the `SavedInvoicesPage` for "Category". The AI's suggestion is pre-selected, but the accountant can override it before exporting to Tally.
- **Feedback Loop:** Future optimization could involve saving the accountant's overrides to fine-tune the AI so it learns the specific accountant's categorization habits over time.
