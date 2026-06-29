# LedgerLens — Technical Architecture

## Stack Overview
- **Frontend:** React 19 + Vite + Tailwind CSS + Lucide Icons + React Query (PWA Optimized)
- **Backend/API:** FastAPI (Python) - Handles secure AI communication and PDF processing.
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (Email/Password)
- **AI Processing:** Google Gemini 2.5 Flash / OpenRouter (Server-side execution)
- **Cron / Uptime:** GitHub Actions workflow (`.github/workflows/keep-supabase-awake.yml`)

## Database Schema (Supabase)
The system is built on a heavily normalized multi-tenant structure to ensure 100% data isolation between clients.

### 1. `auth.users`
The core Supabase authentication table. Represents the Accountant/CA using the software.

### 2. `profiles`
- Extends the auth user.
- Holds the `credits` wallet balance (default 100 on signup).
- Tracked via an automatic Supabase Trigger on user creation.
- **Graceful Fallback:** If the trigger fails, both frontend and backend gracefully default to 100 credits without crashing.

### 3. `clients`
- Represents the individual businesses managed by the accountant.
- Fields: `id`, `user_id` (Accountant), `client_name`, `gstin`, `pan`.
- RLS Policy: Accountant can only view/edit their own clients.

### 4. `invoices` & `invoice_line_items`
- The core ledger of scanned invoices.
- **Foreign Keys:** Linked to `user_id` (the accountant) AND `client_id` (the specific business).
- Fields: All 37 extracted data points (supplier details, buyer details, item financials, E-Way bills).
- Indexed heavily (`idx_invoices_client`, `idx_invoices_user`, etc.) to scale to 10k+ rows effortlessly.
- RLS Policy: Restricted by `user_id`.

## UI Architecture & Global State
- **`ClientContext.tsx`:** Manages the globally `activeClientId`. This context wraps the entire application.
- **React Query (`@tanstack/react-query`):** Manages server state caching. Invoices and clients are fetched once and cached in memory for instantaneous tab switching without loading spinners.
- **Data Filtering:** Every page (Dashboard, Saved Invoices, Scanner) explicitly reads `activeClientId` and appends `.eq('client_id', activeClientId)` to all Supabase queries. This guarantees that an accountant never sees Client A's invoices mixed with Client B's invoices.
- **Mobile Responsive Logic:**
  - Layout structures use `min-h` instead of strict `100vh` bounds on mobile to prevent grid crushing.
  - Hover actions on desktop fallback to permanent visibility on mobile touch screens.

## Infrastructure Strategy
- **Frontend:** Fully statically compiled and can run for free on Vercel, Netlify, or Cloudflare Pages.
- **Backend:** FastAPI containerized for deployment on Render, Railway, or Google Cloud Run.
- **Database:** Supabase Postgres.

## 🛑 Immutable Technical Decisions
### AI Image Pre-Processing (Resolution Rules)
**Rule:** The frontend image compressor (`ScanPage.tsx`) downscales images to a maximum of **1536x1536 pixels** at **80% JPEG quality** before sending to the backend API.
**Why this must NOT be changed:** 
GST invoices contain incredibly dense, tiny text (HSN codes, decimal points, PAN numbers). Any resolution lower than 1536x1536 causes the OCR/AI extraction accuracy to drop. A 3-5 second upload wait time is an acceptable trade-off for near-perfect data accuracy. Do not attempt to "optimize" this by lowering the resolution.
