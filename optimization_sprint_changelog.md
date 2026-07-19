# KhataLens Optimization Sprint Changelog & Revert Guide

This document catalogs every issue addressed during the 4-Phase Optimization Sprint, exactly what changes were made, which files were affected, and how to safely revert them if needed.

---

## Phase 1: Critical Bug Fixes

### 1. API Route Prefix Doubling (404 Errors)
*   **The Issue:** `reconcile_routes.py` and `admin_routes.py` had hardcoded `/api/...` prefixes in their `@router` decorators, but `main.py` was also mounting them with the same prefix. This caused endpoints to register as `/api/reconcile/api/reconcile`, leading to 404 Not Found errors.
*   **The Fix:** Stripped the `/api/reconcile` and `/api/admin` prefixes from the route decorators inside the individual router files.
*   **Files Modified:** 
    *   `backend/reconcile_routes.py`
    *   `backend/admin_routes.py`
*   **How to Revert:** Re-add `/api/reconcile` to the `@router.post` strings in `reconcile_routes.py` and `/api/admin` to `admin_routes.py`.

### 2. The Wallet Race-Condition Exploit
*   **The Issue:** Users could initiate a scan, and if the scan failed or they disconnected, credits were deducted *after* the expensive AI extraction had already consumed resources. This allowed free processing by exploiting timeouts.
*   **The Fix:** Moved `decrement_credits` to execute *before* the AI extraction block. Introduced a `refund_credits` RPC fallback that triggers if the extraction fails to return the credits safely.
*   **Files Modified:** 
    *   `backend/main.py` (in `scan_invoice`)
    *   `backend/whatsapp_service.py`
*   **How to Revert:** Move the `decrement_credits` logic back to the bottom of the API functions, beneath the AI extraction logic, and remove the `refund_credits` except block.

### 3. Database Schema & RLS Broken References
*   **The Issue:** The dashboard and vendor policies referenced a nonexistent `client_users` table. The `profiles` table had a legacy `credits` column instead of pulling from `organizations.credits`.
*   **The Fix:** Created `migration_phase54_bug_fixes.sql`. It implemented the `refund_credits` and `upgrade_user_tier` RPCs, dropped `profiles.credits`, and refactored the RLS policies to use the secure `has_client_access()` function.
*   **Files Created:** 
    *   `supabase/migrations/migration_phase54_bug_fixes.sql`
*   **How to Revert:** Create a rollback SQL script that deletes the new RPCs, re-adds the `credits` column to `public.profiles`, and restores the legacy raw-query RLS policies.

### 4. Tax Calculation Data Loss
*   **The Issue:** The `apply_tax_calculations` function in the backend indiscriminately overwrote perfectly valid AI-extracted tax headers with `0` if the line items array was empty.
*   **The Fix:** Wrapped the tax-overwrite logic in a conditional check that ensures line items actually exist and sum to a valid number before overriding the header values.
*   **Files Modified:** 
    *   `backend/main.py`
*   **How to Revert:** Remove the `if valid_line_items > 0:` guard clause in `apply_tax_calculations`.

### 5. ClientsPage Missing Org ID Error
*   **The Issue:** Adding a new client failed with an RLS violation because the insertion payload lacked the `org_id`.
*   **The Fix:** Appended `org_id: activeOrgId` to the client creation payload in the frontend.
*   **Files Modified:** 
    *   `frontend/src/pages/ClientsPage.tsx`
*   **How to Revert:** Remove `org_id: activeOrgId` from the `supabase.from('clients').insert(...)` call.

---

## Phase 2: Architectural & Security Debt

### 6. Connection Pooling (Socket Exhaustion)
*   **The Issue:** FastAPI was instantiating a new `httpx.AsyncClient()` for every single API request, quickly exhausting server sockets under high concurrent load.
*   **The Fix:** Implemented a global `@asynccontextmanager` in `http_client.py` that maintains a shared `httpx` connection pool. Updated all routes to pull from this shared client rather than creating their own.
*   **Files Created/Modified:** 
    *   `backend/http_client.py` (New)
    *   `backend/main.py`
    *   `backend/sales_routes.py`, `backend/reconcile_routes.py`, `backend/whatsapp_service.py`, `backend/gstin_service.py`, `backend/payment_routes.py`, `backend/bank_routes.py`, `backend/bank_reconcile_routes.py`, `backend/batch_routes.py`, `backend/public_routes.py`.
*   **How to Revert:** Delete `http_client.py` and replace `async with get_shared_client() as client:` with `async with httpx.AsyncClient() as client:` across all backend files.

### 7. Hardcoded Secrets
*   **The Issue:** `AuthPage.tsx` contained a hardcoded `test@example.com` fallback in development.
*   **The Fix:** Removed the hardcoded credentials entirely.
*   **Files Modified:** 
    *   `frontend/src/pages/AuthPage.tsx`
*   **How to Revert:** Restore `const email = import.meta.env.DEV ? 'test@example.com' : ''`.

### 8. Missing Auth Checks
*   **The Issue:** The `reject_match` endpoint in the bank reconciliation route had no JWT verification.
*   **The Fix:** Injected the `authorization: str = Header(None)` dependency and `_verify_user` logic to enforce authentication.
*   **Files Modified:** 
    *   `backend/bank_reconcile_routes.py`
*   **How to Revert:** Remove the `authorization` parameter and the `_verify_user` call from the route signature.

---

## Phase 3: Frontend Performance & UX

### 9. React Stale Closures (Memoization Thrashing)
*   **The Issue:** The `updateExtractedData` function in `ScanPage.tsx` was redefined on every render, causing `React.memo` components (like `InvoiceRow`) to thrash and re-render unnecessarily, degrading performance.
*   **The Fix:** Wrapped the function in a `useCallback` hook with proper dependency tracking. Also ensured uncontrolled input warnings were resolved using `value={data[col] || ''}` fallbacks.
*   **Files Modified:** 
    *   `frontend/src/pages/ScanPage.tsx`
*   **How to Revert:** Remove the `useCallback` wrapper and dependency array from the function.

### 10. AuditLogsPage Search Crash
*   **The Issue:** The UI crashed when attempting to search audit logs with an empty or missing field.
*   **The Fix:** Added null-coalescing and optional chaining to the `.filter()` logic.
*   **Files Modified:** 
    *   `frontend/src/pages/AuditLogsPage.tsx`
*   **How to Revert:** Remove the `?.toLowerCase()` and `|| ""` fallbacks in the search filter.

### 11. Reconciliation Default Period Crash
*   **The Issue:** The reconciliation page had a hardcoded default period (`03-2024`) which provided a poor UX and broke calculations when records didn't match.
*   **The Fix:** Updated the state initializer to dynamically calculate the current month/year (`${currentMonth}-${currentYear}`).
*   **Files Modified:** 
    *   `frontend/src/pages/ReconciliationPage.tsx`
*   **How to Revert:** Revert the initial state to `useState('03-2024')`.

### 12. Real-time Credits & Large Table Freezing
*   **The Issue:** The user's credit balance only updated on a hard refresh, and `SavedInvoicesPage.tsx` froze the browser when rendering thousands of invoices.
*   **The Fix:** 
    *   Subscribed to the `organizations` table via `supabase.channel()` in `ClientContext.tsx` to push credit updates live via WebSockets.
    *   Extracted the `<tr>` block in `SavedInvoicesPage.tsx` into a `MemoizedInvoiceRow` wrapped in `React.memo` for drastic scrolling performance gains.
*   **Files Modified:** 
    *   `frontend/src/lib/ClientContext.tsx`
    *   `frontend/src/pages/SavedInvoicesPage.tsx`
*   **How to Revert:** Remove the `supabase.channel` subscription logic from the context `useEffect`. Replace `MemoizedInvoiceRow` with standard JSX markup in the `.map()` loop.

---

## Phase 4: Feature Enhancements

### 13. Secure Payment Verification
*   **The Issue:** The `/api/verify-payment` route trusted the database `expected_amount` without verifying if the user actually paid that amount on Razorpay, exposing a price manipulation vulnerability. It also lacked environment guards for the mock mode webhook.
*   **The Fix:** Implemented `rzp_client.payment.fetch(payment_id)` to interrogate the live Razorpay API for the true `actual_amount` paid. Added an `os.getenv("ENVIRONMENT") == "production"` block to aggressively throw 500 errors if mock webhooks or mock order creations are attempted in production.
*   **Files Modified:** 
    *   `backend/payment_routes.py`
*   **How to Revert:** Remove the `rzp_client.payment.fetch()` call and revert `actual_amount = expected_amount`. Remove the `ENVIRONMENT` checks.

### 14. GSTR-2B Inline Edit & Acknowledge
*   **The Issue:** Users had no way to manually force-match a GSTR-2B invoice that had minor OCR typos (e.g. GSTIN missing a digit).
*   **The Fix:** Added an interactive inline editor to `ReconciliationPage.tsx`. When a row is mismatched or missing, an "Edit" button appears allowing on-the-fly GSTIN and Invoice Number updates. An "Acknowledge" button was added to instantly update the `recon_status` to `matched`.
*   **Files Modified:** 
    *   `frontend/src/pages/ReconciliationPage.tsx`
*   **How to Revert:** Delete the `editingId` and `editForm` state definitions, remove the `handleSaveEdit` and `handleAcknowledge` functions, and remove the JSX blocks displaying the action buttons.
