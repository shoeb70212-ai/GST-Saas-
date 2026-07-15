# Phase 1: Code Quality & Static Analysis Report

## 1. Executive Summary
A static analysis sweep was performed across the KhataLens codebase (`frontend/` and `backend/`). The analysis identified several instances of technical debt, specifically around React Fast Refresh violations, unused variables, and exhaustive dependency warnings in React hooks. Fixing these will improve developer experience (HMR) and prevent subtle rendering bugs.

## 2. Mapped Issues (Frontend)

### 2.1 React Fast Refresh Violations (`react/only-export-components`)
**Issue:** Vite's Fast Refresh mechanism fails if a file exports both React components and non-component variables (like constants).
*   `src/lib/ScanContext.tsx`: Exports `AVAILABLE_COLUMNS` and `DEFAULT_COLUMNS` alongside the Context provider.
*   `src/pages/DashboardPage.tsx`: Exports `AVAILABLE_WIDGETS` alongside the Dashboard component.
*   **Resolution:** Move these constants into a separate configuration file (e.g., `src/config/constants.ts`) or remove the `export` keyword if they are only used locally.

### 2.2 Unused Variables & Catch Parameters (`eslint/no-unused-vars`)
**Issue:** Several test files contain unused variables or empty catch blocks which can mask errors and violate clean code standards.
*   `e2e/scan-edge-cases.spec.ts`: Unused catch parameters `e` and `err`.
*   `e2e/reconciliation-edge-cases.spec.ts`: Unused catch parameter `e`.
*   `e2e/critical-flows.spec.ts`: Unused catch parameter `e` and unused function parameter `accessToken` in `loginViaSessionInjection`.
*   `src/lib/ScanContext.tsx` & `src/pages/DashboardPage.tsx`: Empty catch blocks `catch (e) {}`.
*   **Resolution:** Prefix unused parameters with an underscore (`_e`, `_err`) or remove them if entirely unnecessary. Log or safely ignore empty catch blocks explicitly.

### 2.3 React Hooks Exhaustive Dependencies (`react-hooks/exhaustive-deps`)
**Issue:** `useEffect` and `useCallback` hooks missing or containing unnecessary dependencies.
*   `src/pages/ScanPage.tsx`: 
    *   `useEffect` missing `setFileStates` and `fetchPendingBatchInvoices`.
    *   `useCallback` missing `handleZipUpload`, `setFileStates`, and `scanFile`.
    *   `useCallback` has unnecessary dependency `fileStates` and `activeClientId`.
*   **Resolution:** Correct the dependency arrays to ensure state updates trigger correctly without causing infinite loops.

## 3. Mapped Issues (Backend)
*   The backend is a FastAPI Python application. A manual review of `main.py` and route files indicates generally well-structured asynchronous routes.
*   *Actionable Cleanup:* Ensure robust exception handling in `batch_routes.py` and `reconcile_routes.py`. (Further deep-dive to follow if performance bottlenecks arise).

## 4. Execution Plan
1. Extract constants from `ScanContext.tsx` and `DashboardPage.tsx`.
2. Fix ESLint warnings in the E2E test files and frontend contexts.
3. Fix dependency arrays in `ScanPage.tsx`.
