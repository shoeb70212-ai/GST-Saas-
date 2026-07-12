# Security & Architecture Audit Patches (v1.2)

An external, rigorous AI code audit was performed on the KhataLens platform. It successfully identified several deep architectural flaws, edge-case memory leaks, and mathematical edge-cases that emerged during rapid prototyping. 

This document serves as the official record of the **Critical and High** patches applied to harden the system for production.

---

## 1. Data Integrity & Resilience Fixes

### 1.1 GSTR-2B Reconcile Data-Loss Prevention (Critical)
**The Problem:** The `reconcile_routes.py` endpoint followed a naive `DELETE` before `INSERT` pattern. It deleted all old records for a given month and then attempted to bulk-insert the new reconciliation chunk. If the Supabase insert failed (due to network timeout or DB locks), the user suffered irrecoverable data loss for that entire month.
**The Fix:** Implemented a robust application-level manual transaction rollback. The backend now:
1. Fetches and stores all old records in memory.
2. Executes the `DELETE`.
3. Attempts chunked `INSERT`s.
4. If *any* insert fails, it catches the exception and automatically re-inserts the old records from memory before returning an HTTP 500.

### 1.2 CSV Parsing Stability (High)
**The Problem:** Uploading a malformed CSV without the expected GSTR-2B column headers (e.g., missing "GSTIN of Supplier") caused the Pandas dataframe to throw an unhandled `KeyError`, crashing the Python backend.
**The Fix:** Replaced hardcoded dictionary lookups with `.get()` fallbacks. If the headers are missing, the algorithm cleanly skips the row or returns a polite HTTP 400 error rather than a violent server crash.

### 1.3 Strict Empty-String Nullification (Critical)
**The Problem:** The React frontend was sending empty strings (`""`) to the Supabase database when AI extraction left numeric fields (like `Taxable_Amount`) blank. PostgreSQL violently rejected `""` for `DECIMAL` columns, causing silent save failures where the dashboard remained totally blank.
**The Fix:** Wrote a `safeNum()` parser in `ScanPage.tsx` that intercepts all payload data before it hits the network and securely converts empty strings and `NaN` values to true `null`, allowing PostgreSQL to accept the rows flawlessly.

---

## 2. Security & Compliance Patches

### 2.1 Free-Credit Profile Exploit (Critical)
**The Problem:** If the database trigger that creates a user's profile failed upon signup, the backend gracefully caught the error but defaulted to granting `100` free credits in memory to keep the app working. A malicious user could exploit this to bypass credit tracking.
**The Fix:** The fallback logic in `main.py` was altered to grant `0` credits if a profile is missing, ensuring financial integrity. 

### 2.2 CORS Spec Compliance (High)
**The Problem:** The FastAPI backend used `allow_origins=["*"]` combined with `allow_credentials=True`. This is technically an illegal combination in the modern HTTP CORS specification.
**The Fix:** Because KhataLens uses stateless Bearer JWTs in the Authorization header (and not cookies), we disabled credentials (`allow_credentials=False`), bringing the wildcard origin into perfect alignment with security standards while keeping deployments easy.

### 2.3 Strict GSTIN Regex (High)
**The Problem:** The regex used to validate Indian GSTINs was `^[0-3][0-9]...`, which mathematically permitted invalid State Codes like `00`, `38`, and `39` (India only has 37 states/UTs).
**The Fix:** Applied a mathematically correct regex `^(0[1-9]|[1-2][0-9]|3[0-7])` on both the frontend (`utils/gstin.ts`) and the backend (`main.py`) to guarantee absolute validation.

### 2.4 Rule 37 Section 50 Statutory Interest (High)
**The Problem:** The platform correctly calculated the Input Tax Credit (ITC) "at risk" of reversal under Rule 37 (180-day non-payment rule), but failed to calculate the mandatory 18% p.a. interest penalty that buyers must pay to the government upon reversal.
**The Fix:** Upgraded `calculations.ts` to compute both the principal ITC at risk and the 18% p.a. interest penalty based on days overdue.

---

## 3. Performance & Code Quality

### 3.1 WebSocket Memory Leak Plugged (Critical)
**The Problem:** The Supabase Realtime channel in `ScanPage.tsx` was wrapped in a React `useEffect` that had `fileStates` in its dependency array. Because `fileStates` updates rapidly during batch AI extraction (progress bars, status changes), React was continuously tearing down and reconnecting the WebSocket to the Supabase server.
**The Fix:** Removed `fileStates` from the dependency array and relied on functional state updates, ensuring a single, stable WebSocket connection is maintained for the life of the page.

### 3.2 Controlled React Inputs (High)
**The Problem:** The manual extraction table relied on `defaultValue` (uncontrolled inputs). If the AI background process updated an invoice with new data *after* the user clicked on it, the input box refused to update visually.
**The Fix:** Swapped to controlled `value={data[col]}` inputs so that the UI instantly reacts and re-renders if external state pushes new data to that row.

### 3.3 Tax Logic Refactoring (Medium)
**The Problem:** The complex 20-line block of Python math calculating CGST/SGST/IGST splits was blindly copy-pasted in both the primary AI strategy and the Gemini Fallback strategy, creating divergence risk.
**The Fix:** Extracted this into a dry `apply_tax_calculations()` function in `main.py`.

### 3.4 Schema Drift Resolution (Medium)
**The Problem:** The production database had new columns (`processing_status`, `error_message`, `expense_category`, `extraction_state`) added via hot-migrations, but the base `supabase_schema.sql` was never updated.
**The Fix:** Synced the core `.sql` file with the production reality so new developers/deployments don't crash when running background batch jobs.
