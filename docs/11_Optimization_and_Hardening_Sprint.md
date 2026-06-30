# LedgerLens — Optimization & Hardening Sprint v1

This document outlines the specific architectural, performance, and security patches applied during the optimization sprint following the comprehensive AI codebase audit.

## Overview
The goal of this sprint was strictly to address critical bottlenecks, prevent rate-limiting crashes, and seal security vectors. **No new features were added**, adhering to the core MVP scope.

## 1. Cost & Rate Limit Fixes (Backend)
These fixes were critical to preventing API budget burn and system crashes under load.

### A. AI Token Cost Reduction (Image Resizing)
*   **File:** `backend/main.py`
*   **Problem:** We were passing 10-15MB JPEGs directly to OpenRouter/Gemini, burning tokens rapidly and increasing latency.
*   **Solution:** 
    *   Added a `Pillow` (PIL) `thumbnail` pass using `LANCZOS` resampling to guarantee images are scaled down to 2048px maximum before base64 encoding. 
    *   Reduced PDF extraction DPI from 200 to 150 for `PyMuPDF` (`fitz`).
*   **Impact:** Massive reduction in input token costs and faster API response times.

### B. Batch Processing Rate Limiter (Semaphore)
*   **File:** `backend/batch_routes.py`
*   **Problem:** Uploading a 50-file ZIP would spawn 50 concurrent AI requests instantly on the FastAPI event loop, triggering `429 Too Many Requests` from OpenRouter.
*   **Solution:** Implemented an `asyncio.Semaphore(5)` to ensure a maximum of 5 AI extractions happen concurrently.
*   **Impact:** Stable batch processing for large ZIP files without API rejection.

## 2. Frontend Speed & Accuracy
These fixes address severe client-side performance issues and calculation bugs.

### A. Dashboard Memory Leak & Lag (React Query)
*   **File:** `frontend/src/pages/DashboardPage.tsx`
*   **Problem:** The dashboard ran a `select('*')` query pulling all JSONB blob columns for every invoice, with no pagination, and TanStack query had no `staleTime`.
*   **Solution:** 
    *   Changed to a strict projection (`select('id, file_name, total_amount, ...')`).
    *   Added a `.range(0, 199)` pagination limit.
    *   Added `staleTime: 5 * 60 * 1000` (5 minutes).
*   **Impact:** Dashboard loads instantly and consumes a fraction of the bandwidth/memory.

### B. Tax Double-Counting Bug (Sales Register)
*   **File:** `frontend/src/pages/DashboardPage.tsx`
*   **Problem:** The sales register logic was summing both individual tax columns (CGST, SGST) *and* the Total Tax column if both matched the keyword array.
*   **Solution:** Rewrote the parsing logic to prioritize specific tax columns (CGST/SGST/IGST) and only fall back to the "Total Tax" column if the specific breakdown is missing.
*   **Impact:** Accurate dashboard metrics for outward supplies.

## 3. Data Quality & Security
These fixes resolve brittle string matching and security vulnerabilities.

### A. Fuzzy Reconciliation Fix (Leading Zeros)
*   **File:** `backend/reconcile_routes.py`
*   **Problem:** The matching logic failed if a supplier uploaded `INV-001` and the user had `INV-1`.
*   **Solution:** Updated `clean_str` with a regex `re.sub(r'(\D)0+(\d)', r'\1\2', s)` to intelligently strip leading zeros from invoice numbers during comparison.
*   **Impact:** Dramatically fewer false "Mismatches" in GSTR-2B reconciliation.

### B. Tally XML Crashes (XML Escaping)
*   **File:** `frontend/src/pages/SavedInvoicesPage.tsx`
*   **Problem:** The Tally XML export only escaped `&`. Other characters (`<`, `>`, `"`, `'`) would corrupt the XML.
*   **Solution:** Created a strict `escapeXml` helper that sanitizes all XML control characters.
*   **Impact:** 100% reliable Tally imports.

### C. Portal Upload DoS Vector (Size Caps)
*   **File:** `frontend/src/pages/CollaborationPortal.tsx`
*   **Problem:** The unauthenticated CA portal was vulnerable to massive file dumps.
*   **Solution:** Added strict client-side validation using `react-dropzone`: max 10MB per file, and a hard ceiling of 50MB per session.
*   **Impact:** Prevents client-side memory spikes and basic abuse.

### D. Database Speed (Indexes)
*   **File:** `supabase_schema.sql`
*   **Problem:** Missing core indexes for sorting and filtering.
*   **Solution:** Appended `CREATE INDEX` statements to the schema for `client_id`, `invoice_date`, `recon_status`, and `processing_status`.

## 4. Operational Directives
*   **Agent Protocols:** Added a new rule to `AGENTS.md` dictating a strict "Challenge and Validate" protocol before accepting suggestions from other AI models.
*   **Future Features:** Isolated all out-of-scope feature requests (like GSTR-3B pre-fill, ITC aging dashboards) into `future_features_brainstorm.md` for future consideration.
