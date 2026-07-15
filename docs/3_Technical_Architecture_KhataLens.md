# KhataLens — Technical Architecture

## Stack Overview
- **Frontend:** React 19 + Vite + Tailwind CSS + Lucide Icons + React Query (PWA Optimized)
- **Frontend Testing:** Playwright Pro (Web-First assertions, local Vite webServer integration)
- **Backend/API:** FastAPI (Python) - Handles secure AI communication, PDF processing, and math reconciliation.
- **Backend Testing:** Pytest with `pytest-asyncio` and deep Supabase/OpenAI mocking.
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (Email/Password & JWT)
- **AI Processing:** Google Gemini 2.5 Flash (Server-side execution with `response_format` JSON Schema)
- **Cron / Background:** Render Background Workers (for WhatsApp ingestion and bulk processing) & GitHub Actions.

## Infrastructure Strategy
- **Frontend:** Statically compiled, hosted on Vercel.
- **Backend:** FastAPI containerized for deployment on Render.
- **Database:** Supabase Postgres with Realtime capabilities.

## The AI Orchestration Architecture
KhataLens uses a sophisticated multi-stage AI pipeline to ensure data accuracy and control LLM costs.

1. **PDF Parsing (PyMuPDF):** Before any file touches the LLM, the FastAPI backend uses PyMuPDF (`fitz`) to extract raw text and images. This strips out heavy binary data, drastically reducing token payloads.
2. **Structured Outputs (JSON Schema):** We never rely on standard markdown text responses. All LLM calls use strict JSON schemas ensuring exactly 37 fields for invoices, or precise column arrays for bank statements.
3. **The Hybrid Reconciliation Engine:**
   - *Tier 1 (Deterministic Math):* Runs purely in Python. Instantly matches bank withdrawal amounts to invoice totals within a ₹1.00 tolerance. Costs ₹0.00 and has 0% hallucination risk.
   - *Tier 2 (AI Fuzzy Match):* Sent to Gemini 2.5 Flash. Used for resolving partial payments or names that don't perfectly align (e.g., "NEFT-AMZ" to "Amazon India").

## Database Schema (Supabase)
The system is built on a heavily normalized multi-tenant structure to ensure 100% data isolation between clients.

### Core Architecture Tables
- **`auth.users` / `profiles`**: The CA using the software. `profiles` holds their `credits` wallet.
- **`clients`**: The businesses managed by the CA. Data is sharded logically via Row-Level Security (RLS) on `client_id`.

### Ledger Tables
- **`invoices` & `invoice_line_items`**: The core ledger of scanned purchase/sales invoices.
- **`bank_statements` & `bank_transactions`**: Stores parsed PDF bank statement data. Tracks whether an entry is a deposit or withdrawal and its current `status` (unreconciled, matched).
- **`reconciliation_suggestions`**: The bridge table. Stores the output of both Tier 1 and Tier 2 matching engines. Fields include `match_type` (EXACT, AI_FUZZY, MANUAL) and `status` (SUGGESTED, APPROVED, REJECTED). This table enforces the "Human-in-the-Loop" requirement.

## UI Architecture & Global State
- **`ClientContext.tsx`:** Manages the globally `activeClientId`.
- **React Query (`@tanstack/react-query`):** Manages server state caching for instantaneous tab switching.
- **Data Filtering:** Every page (Dashboard, Reconcile, Bank Statements) strictly enforces `.eq('client_id', activeClientId)` to guarantee isolated views.

## 🛑 Immutable Technical Decisions
### AI Image Pre-Processing (Resolution Rules)
**Rule:** The frontend image compressor downscales images to a maximum of **1536x1536 pixels** at **80% JPEG quality** before sending to the backend API.
**Why this must NOT be changed:** GST invoices contain incredibly dense, tiny text. Any resolution lower than 1536x1536 causes the OCR accuracy to plummet.

### Human-in-the-Loop Reconciliation
**Rule:** AI matches (`reconciliation_suggestions`) must ALWAYS be created with `status = 'SUGGESTED'`. They cannot be auto-approved into the ledger.
**Why this must NOT be changed:** A single hallucinated match during tax season can cause severe compliance issues (GSTR mismatches). The CA must explicitly click "Approve" in the UI.
