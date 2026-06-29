# LedgerLens (formerly PayForce)

**LedgerLens** is an AI-powered GST Invoice Scanner and Multi-Tenant Accountant Workspace. 
*   **AI Extraction:** Automatically extracts 37 fields from purchase invoices using Gemini 2.5 Flash.
*   **Accountant Workspaces:** Multi-tenancy support for managing dozens of clients securely.
*   **Custom Dashboards:** Dynamic widgets for tracking Sunk GST, Total Taxable, CGST, SGST, IGST, and Outstanding amounts per client.

*(The original concept, PayForce, focused on MSME Collections and AR management, which remains part of the core infrastructure).*

## 🚀 The Core Problem & Our Solution
When an MSME raises an invoice and the buyer defaults, the MSME has already paid the GST to the government. This **"Sunk GST Exposure"** is a permanent cash loss because the GST law (Section 34) does not allow credit notes for bad debts.

PayForce turns this compliance burden into an enforcement weapon. It helps MSMEs:
1. **Visualize Sunk GST:** See exactly how much money has already been lost to the government on unpaid invoices.
2. **Utilize Rule 37 (CGST Rules):** If a buyer doesn't pay within 180 days, they must reverse their claimed Input Tax Credit (ITC) and pay 18% interest. PayForce generates legally-precise warnings citing this specific risk.
3. **Enforce MSMED Act:** Automatically calculate compound interest (3x RBI Bank Rate) on delayed payments and warn buyers about the loss of their income tax deduction under Section 43B(h).
4. **Prepare for Escalation:** Auto-generate pre-filled summaries ready for the MSME Samadhaan Portal for legal arbitration.

## ✨ Key Features
- **Invoice Entry & Core Ledger:** Easily add invoices, track payments, and monitor outstanding balances.
- **Sunk GST & Interest Dashboard:** A centralized widget displaying total Sunk GST exposure, MSMED interest accrued, and invoices in the "Rule 37 Zone."
- **Rule 37 Dunning Sequence Generator:** One-click generation of legally accurate, copy-paste-ready WhatsApp/email messages tailored to each invoice's exact age (from friendly reminders to legal notices).
- **Samadhaan Export:** Generate PDF summaries for immediate legal filing when the 180-day mark is crossed.
- **PWA Ready:** A mobile-first Progressive Web App designed for the MSME owner who primarily uses their phone and WhatsApp for business.

## 🛠️ Technology Stack
This product is built for scale with a robust, zero-cost infrastructure stack:
- **Frontend:** React 19 + Vite (PWA optimized) with shadcn/ui and Tailwind CSS.
- **Backend:** FastAPI (Python 3.11) for high-performance calculations and API endpoints.
- **Database & Authentication:** Supabase (PostgreSQL) with Row Level Security (RLS).
- **Deployment:** Vercel (Frontend) & Render (Backend).

## 📂 Project Structure
- `/frontend`: The Vite/React Progressive Web App.
- `/backend`: The Python FastAPI server handling the logic, MSMED math, and Rule 37 engine.
- `Vision.md`: The complete product vision, legal foundation, and phase-by-phase execution plan.
- `Deployment_Guide.md`: Step-by-step instructions for deploying to Vercel and Render.
- `supabase_schema.sql`: The database schema, including RLS policies and dashboard calculation views.

## 🚀 Getting Started

### Prerequisites
- Node.js & npm (for frontend)
- Python 3.11+ (for backend)
- A Supabase Project

### Installation
1. **Database:** Run `supabase_schema.sql` in your Supabase SQL Editor.
2. **Backend:** Navigate to `/backend`, install requirements (`pip install -r requirements.txt`), and run the FastAPI server.
3. **Frontend:** Navigate to `/frontend`, install dependencies (`npm install`), configure your `.env` with Supabase details, and start the Vite dev server (`npm run dev`).

For production deployment details, refer to the [Deployment Guide](./Deployment_Guide.md).
