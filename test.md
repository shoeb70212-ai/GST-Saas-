# KhataLens — Critical Flow E2E Test Suite

## Overview

Created **7 high-impact Playwright E2E tests** in [critical-flows.spec.ts](file:///d:/GST%20SAAS/frontend/e2e/critical-flows.spec.ts) designed to catch the bugs that would directly cause **revenue loss, data corruption, or security breaches**.

## Test Summary

| # | Test Name | What It Breaks If It Fails | Impact |
|---|-----------|---------------------------|--------|
| 1 | **Auth Guard** — 8 protected routes | Unauthenticated users access invoice data, settings, wallet | 🔴 Security |
| 2a | **Invoice Scan** — Valid PDF | Core product broken: no AI extraction, credits drained without service | 🔴 Revenue |
| 2b | **Invoice Scan** — Invalid file | Credits deducted for garbage uploads; no error shown | 🔴 Revenue |
| 3 | **Zero Credit Guard** | Users scan for free indefinitely; revenue dies | 🔴 Revenue |
| 4 | **Client Data Isolation** | Client A sees Client B's invoices — catastrophic data breach | 🔴 Data |
| 5a | **GSTR-2B Reconciliation** — Valid upload | Accountant feature crashes; user retention drops | 🟠 Retention |
| 5b | **GSTR-2B Reconciliation** — Corrupt file | White screen / unrecoverable error instead of graceful message | 🟠 UX |
| 6 | **Bulk Delete** | Invoices not actually deleted, or MORE than selected deleted | 🟠 Data |
| 7 | **Payment Flow** | Wallet page crashes; users cannot buy credits | 🔴 Revenue |

## Files Changed

| File | Action |
|------|--------|
| [critical-flows.spec.ts](file:///d:/GST%20SAAS/frontend/e2e/critical-flows.spec.ts) | **NEW** — 7 test cases |
| [playwright.config.ts](file:///d:/GST%20SAAS/frontend/playwright.config.ts) | **MODIFIED** — Longer timeouts, sequential execution, failure artifacts |
| [package.json](file:///d:/GST%20SAAS/frontend/package.json) | **MODIFIED** — Added `test:e2e` and `test:e2e:ui` scripts |

## How to Run

```bash
# From the frontend directory, with both dev servers running:
cd frontend

# Run all E2E tests headless
npm run test:e2e

# Run with interactive Playwright UI (recommended for debugging)
npm run test:e2e:ui

# Run only a specific test
npx playwright test -g "Auth Guard"
```

> [!IMPORTANT]
> Both the **frontend** (`npm run dev`) and **backend** (`uvicorn main:app --reload`) dev servers must be running before executing the tests.

## Design Decisions

- **Sequential execution** (`workers: 1`): Tests share a credit balance. Running in parallel would cause race conditions where Test 2 deducts a credit that Test 3 expects to be zero.
- **Real Supabase, not mocks**: These tests hit the live local Supabase instance because the goal is to catch **integration seam failures** (e.g., RLS blocking a query, Supabase SDK version mismatch) — the class of bugs that unit tests with mocked clients can never catch.
- **Route interception for payment**: Test 7 intercepts the `/api/create-order` call to prevent actual Razorpay charges during testing, but still verifies the full frontend flow up to that point.
