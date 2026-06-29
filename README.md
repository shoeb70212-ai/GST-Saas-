# LedgerLens (formerly PayForce)

**LedgerLens** is an AI-powered GST Invoice Scanner and Multi-Tenant Accountant Workspace built for Indian professionals. 

---

## 🔄 The Pivot: From PayForce to LedgerLens

**Original Concept (PayForce):** 
The project started as an Accounts Receivable (AR) and Collections tool for MSMEs. The idea was to use Indian GST compliance laws (Sunk GST, Rule 37, MSMED Act) as legal leverage to force buyers to pay their outstanding invoices. It included Dunning sequence generators and legal notices.

**Why We Pivoted (LedgerLens):**
We realized that building a tool purely focused on "Collections & Legal Enforcement" was highly risky, very niche, and might not result in immediate paid conversions. Instead, we shifted focus to a **simpler, high-value utility that solves an immediate daily pain point for a specific audience: Accountants.**
Accountants spend hours manually typing data from physical/PDF invoices into accounting software. We pivoted to build an AI-powered tool that automates this data entry, organizes it by client, and provides customizable analytics. This solves a real problem that accountants are willing to pay for today.

---

## ✅ What We Have Built (Current State)

The application is currently a highly stable, production-ready Beta for accountants.

### 1. AI Invoice Scanning Engine
*   **Gemini 2.5 Flash Integration:** Processes PDF/Image invoices in seconds.
*   **Comprehensive Extraction:** Extracts exactly 37 distinct data points natively in one pass, including:
    *   Vendor Details (Name, Address, GSTIN, PAN, Email, Phone)
    *   Buyer Details (Name, Address, GSTIN, PAN, PIN)
    *   Financials (Taxable Amount, CGST, SGST, IGST, Total, Received, Balance)
    *   Logistics (PO Number, E-Way Bill, Vehicle Number, Place of Supply)
*   **Cost Optimization Strategy:** Instead of using dynamic AI prompting (which is expensive and unpredictable in token usage), we extract *everything* natively and let the user customize what they want to see via the UI.

### 2. Multi-Tenant Accountant Workspace
*   **Client Management:** Accountants can create and manage multiple client profiles.
*   **Data Isolation (RLS):** Every invoice is strictly tied to a specific `client_id`, ensuring client data never mixes.
*   **Global Client Switcher:** A dropdown UI that instantly filters the entire application (Dashboard, Scanner, Saved Invoices) to the active client's workspace.

### 3. Customizable UI & Dashboards
*   **Modular Dashboard:** Users can toggle widgets (Total Taxable, CGST, SGST, Outstanding, Invoice Count) based on their specific needs.
*   **Dynamic Data Tables:** The "Saved Invoices" page allows accountants to show/hide any of the 37 extracted columns.
*   **Local Persistence:** All customization preferences are saved to the browser's `localStorage` so the UI stays exactly how the accountant configured it.
*   **Excel Export:** 1-click export of the currently visible columns into a `.xlsx` file for use in Tally/Zoho.

### 4. Credit Wallet System
*   **Monetization Foundation:** A built-in wallet system that grants users 100 free credits on sign-up, deducting 1 credit per successful scan.

---

## ⏸️ What Was NOT Done & Why

During development, we actively decided *against* implementing the following features to ensure a fast, stable, and cost-effective Beta launch:

1. **Direct Tally/Zoho Integration:** 
   * *Why not done:* The market has many advanced Tally sync tools. Building a custom Tally XML exporter is complex and distracts from our core value prop (fast AI extraction). We opted for a highly customizable Excel export instead, which accountants can easily import into any software.
2. **Dynamic AI Custom Fields:**
   * *Why not done:* Allowing users to prompt the AI to find "custom" fields significantly increases token usage, slowing down the scan and driving up API costs. We optimized for cost by extracting a massive standard list (37 fields) in a single, cheap LLM call and handling customization on the frontend.
3. **Legal Enforcement Tools (Rule 37 / MSMED):**
   * *Why not done:* Parked during the pivot. Legal enforcement tools carry compliance risk and require a different target audience (Business Owners rather than Accountants).

---

## 🔮 Pending / Future Integration (Roadmap)

Based on our brainstorming for the post-beta phase, here are the highest-value features pending integration:

1. **GSTR-2B Reconciliation (High Priority)**
   * Allowing accountants to upload the government GSTR-2B Excel file and automatically matching it against our scanned invoices to highlight missing ITC and mismatched amounts.
2. **Razorpay / Stripe Monetization**
   * Integrating a payment gateway to the existing Wallet system so accountants can purchase "Scan Bundles" (e.g., ₹999 for 1000 scans) after exhausting their 100 free credits.
3. **Bulk Zip Uploads**
   * Allowing the upload of a `.zip` file containing dozens of PDFs, processed asynchronously in the background.
4. **Automated AI Expense Categorization**
   * Using a secondary, lightweight AI pass to suggest accounting ledger categories (e.g., "Office Supplies", "Travel") based on the extracted line items.
5. **Vendor GSTIN KYC**
   * Pinging a GST portal API to verify if the extracted `supplier_gstin` is Active or Cancelled to protect the client's ITC claims.

---

## 🛠️ Technology Stack
- **Frontend:** React 19 + Vite + Tailwind CSS + Lucide Icons
- **Backend/Database:** Supabase (PostgreSQL) + Auth + Row Level Security (RLS)
- **AI Processing:** Google Gemini 2.5 Flash via `@google/genai`
- **Automation:** GitHub Actions (Uptime ping to keep Supabase free tier active)

## 🚀 Getting Started (Local Dev)
1. Run `supabase_schema.sql` and `migration_phase8.sql` in your Supabase SQL Editor.
2. Navigate to `/frontend`, install dependencies (`npm install`).
3. Configure `.env` with your Supabase details and Gemini API Key.
4. Start the dev server: `npm run dev`.
