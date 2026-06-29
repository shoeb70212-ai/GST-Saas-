# LedgerLens — Technical Architecture

## Stack Overview
- **Frontend:** React 19 + Vite + Tailwind CSS + Lucide Icons (PWA Optimized)
- **Backend/Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (Email/Password)
- **AI Processing:** Google Gemini 2.5 Flash via `@google/genai` (Client-side execution)
- **Cron / Uptime:** GitHub Actions workflow (`.github/workflows/keep-supabase-awake.yml`)

## Database Schema (Supabase)
The system is built on a heavily normalized multi-tenant structure to ensure 100% data isolation between clients.

### 1. `auth.users`
The core Supabase authentication table. Represents the Accountant/CA using the software.

### 2. `profiles`
- Extends the auth user.
- Holds the `credits` wallet balance (default 100 on signup).
- Tracked via an automatic Supabase Trigger on user creation.

### 3. `clients`
- Represents the individual businesses managed by the accountant.
- Fields: `id`, `user_id` (Accountant), `client_name`, `gstin`, `pan`.
- RLS Policy: Accountant can only view/edit their own clients.

### 4. `invoices`
- The core ledger of scanned invoices.
- **Foreign Keys:** Linked to `user_id` (the accountant) AND `client_id` (the specific business).
- Fields: All 37 extracted data points (supplier details, buyer details, item financials, E-Way bills).
- RLS Policy: Restricted by `user_id`.

## UI Architecture & Global State
- **`ClientContext.tsx`:** Manages the globally `activeClientId`. This context wraps the entire application.
- **Data Filtering:** Every page (Dashboard, Saved Invoices, Scanner) explicitly reads `activeClientId` and appends `.eq('client_id', activeClientId)` to all Supabase queries. This guarantees that an accountant never sees Client A's invoices mixed with Client B's invoices.
- **Local Storage Customizations:**
  - `payforce_columns`: Saves the accountant's preferred visible columns for the invoice table.
  - `payforce_widgets`: Saves the accountant's preferred widgets for the dashboard.
  - `payforce_active_client`: Remembers the last selected client across sessions.

## 0$ Infrastructure Strategy
- **Hosting:** The frontend is fully statically compiled and can run for free on Vercel, Netlify, or Cloudflare Pages.
- **Database:** Supabase Free Tier (500MB). Kept alive automatically by a nightly GitHub Action pinging the REST API.
- **AI Backend:** By executing the Gemini API call directly from the client browser (using Vite environment variables), we completely eliminated the need for a separate Python/Node backend server, saving hosting costs and complexity.

## 🛑 Immutable Technical Decisions
### AI Image Pre-Processing (Resolution Rules)
**Rule:** The frontend image compressor (`ScanPage.tsx`) is hardcoded to downscale images to a maximum of **1536x1536 pixels** at **80% JPEG quality** before sending to the AI.
**Why this must NOT be changed:** 
While dropping the resolution to 1024x1024 would make uploads faster, we explicitly tested and rejected that. GST invoices contain incredibly dense, tiny text (HSN codes, decimal points, PAN numbers). Any resolution lower than 1536x1536 causes the OCR/AI extraction accuracy to drop. 
*A 3-5 second upload wait time is an acceptable trade-off for near-perfect data accuracy. Do not attempt to "optimize" this by lowering the resolution.*
