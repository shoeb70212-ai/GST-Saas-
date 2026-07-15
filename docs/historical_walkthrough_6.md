   - Wrapped `tableData`, `invoiceKeys`, `matched`, and `mismatched` arrays in strict `useMemo` hooks.
   - Wrapped critical `fetch` handlers (`handleFileUpload`, `handleDeepMatch`) in `useCallback`.
   - Memoized the Tax Liability Predictor calculations in `DashboardPage.tsx` to ensure snappy UI feedback.

## Master Plan Execution: Phase 4 (UI/UX & Design Polish)
1. **Analysis**: Audited the application's network state handling and React Query `isError` patterns.
2. **Issue Mapping**: Discovered that network failures were failing silently across the app, rendering blank grids. `ReconciliationPage` also lacked loading skeletons, leading to layout shifts and confusion during data fetching.
3. **Execution**:
   - Created a generic `ErrorState.tsx` UI component providing a user-friendly error message and a "Retry" button.
   - Wired up `isError` destructured flags from `useQuery` into `SavedInvoicesPage.tsx`, `DashboardPage.tsx`, and `ReconciliationPage.tsx` to gracefully fall back to the Error State when the database is unreachable.
   - Implemented `Skeleton` loading views inside `ReconciliationPage.tsx` to visually indicate when GSTR-2B datasets are still downloading.