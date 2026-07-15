# KhataLens Deep Architecture & Context Map

> **Generated via `audit-context-building` methodology.**
> This document maps the ultra-granular context of KhataLens before any vulnerability scanning or feature scaling.

## 1. System Orientation (Bottom-Up)

### 1.1 Major Modules
- **Frontend (React/Vite)**
  - UI layer built with Tailwind v4, utilizing a highly bespoke "Modern Heritage" (Glassmorphism & Stone/Gold) design system.
  - Critical pages: `LandingPage.tsx` (Public), `ScanPage.tsx` (Auth-protected, handles OCR upload), `AdminDashboard.tsx` (Privileged).
- **Backend (FastAPI)**
  - Python-based micro-monolith.
  - Core files: 
    - `main.py` (Core app, middleware, direct invoice routes)
    - `batch_routes.py` (Bulk processing queues)
    - `admin_routes.py` (Privileged user management)
    - `payment_routes.py` (Stripe/Razorpay integration)
    - `gstin_service.py` (External GST portal pinging)
    - `reconcile_routes.py` (GSTR-2B matching logic)
- **Database (Supabase/PostgreSQL)**
  - Acts as the primary state store and Auth provider.
  - Employs Row Level Security (RLS) for tenant isolation.

### 1.2 Actors & Trust Boundaries
1. **Public User (Untrusted)**
   - Can access `LandingPage.tsx` and `public_routes.py`.
   - Goal: Convert to authenticated beta user.
2. **Authenticated Client/CA (Semi-Trusted)**
   - Bound by JWT provided by Supabase Auth.
   - Can access `ScanPage.tsx` and upload files.
   - **Boundary**: `main.py` OCR routes rely on the `Authorization` header. If missing/invalid, FastAPI rejects (401).
3. **Admin User (Highly Trusted)**
   - Bound by specific `role = 'admin'` claim in DB/JWT.
   - Can access `admin_routes.py` to view global system health and override limits.
4. **LLM OCR Engine (Gemini 2.5 Flash)**
   - External dependency. Assumed reliable but text output is treated as **untrusted** until parsed and typed by Pydantic models.

---

## 2. Global Invariants & Assumptions

### 2.1 State Invariants
- **INV-01 (Tenant Isolation)**: No database query in `main.py` or `batch_routes.py` shall execute without an explicit `user_id` `WHERE` clause matching the injected JWT identity.
- **INV-02 (Rate Limiting)**: A user cannot process an invoice if their `credits` count in the `users` table is `<= 0`.
- **INV-03 (Data Typing)**: All extracted GSTINs must strictly match the regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` before being committed to the database.

### 2.2 Operational Assumptions
- **ASSUME-01**: Supabase Auth signature verification in FastAPI is cryptographically sound and uses the correct `JWT_SECRET`.
- **ASSUME-02**: The `gemini-2.5-flash` endpoint will return valid JSON when strictly prompted (as handled in `utils.py`).
- **ASSUME-03**: PDF and Image uploads will not exceed 10MB per file (enforced at the Nginx/FastAPI middleware layer).

---

## 3. Workflow Reconstruction: The Core OCR Flow

**Flow**: Authenticated User Uploads Invoice → AI Extracts Data → Saved to DB

1. **Frontend `ScanPage.tsx`**
   - User drops a PDF.
   - React converts to `FormData` and appends `Bearer <token>`.
   - **Assumption**: The token is fresh. If expired, the backend will reject, and Axios interceptors must force a logout.

2. **Backend `main.py` -> `POST /api/scan`**
   - **Inputs**: `UploadFile`, `Authorization` header.
   - **Block 1**: Verify JWT. Extract `user_id`. (Why here? Fail fast before processing large files).
   - **Block 2**: Check credit balance. (If `credits < 1`, revert with 402 Payment Required).
   - **Block 3**: Read file bytes into memory. Send to `utils.py:call_gemini_ocr()`.
   - **Block 4**: Receive raw JSON from Gemini. **First Principle**: Never trust external AI output. The raw JSON is pushed through a strict Pydantic model (`InvoiceSchema`).
   - **Block 5**: Insert validated data into Supabase `invoices` table against `user_id`.
   - **Block 6**: Decrement `credits` by 1. (Potential race condition if done outside a transaction block).
   - **Outputs**: Return 200 OK with extracted data.

---

## 4. Complexity & Fragility Clusters (Risk Areas)

- **Credit Deduction Race Condition**: If a user fires 10 simultaneous `/api/scan` requests, the credit check (Block 2) and deduction (Block 6) might happen concurrently, allowing 10 scans for 1 credit. *Requires DB-level row locking or atomic updates.*
- **GSTR-2B Matching (`reconcile_routes.py`)**: Fuzzy matching strings (e.g., "TechCorp" vs "Tech Corp Inc") carries high algorithmic complexity and memory usage.
- **External GSTIN Ping (`gstin_service.py`)**: Relying on external government/sandbox APIs is fragile due to extreme latency or frequent downtimes. Must have robust fallback circuits.

---
*End of Context Audit. System is structurally mapped.*
