   - Generated `migration_phase31_db_optimizations.sql` containing fixes.
   - The script sets `search_path = public` on elevated functions, adds `idx_gstr2b_client_period` to prevent Sequential Scans, and strictly applies `WITH CHECK` clauses for `gstr2b_records` and `invoice_line_items`.

## Master Plan Execution: Phase 3 (Frontend Architecture & Performance)
1. **Analysis**: Audited the heavy React data grids (`ReconciliationPage.tsx`, `DashboardPage.tsx`) for `react-best-practices` violations.
2. **Issue Mapping**: Identified that thousands of GSTR-2B reconciliation records were being fully recalculated inline during every React render cycle (unnecessary re-renders). Heavy metric aggregations in the dashboard lacked memoization.
3. **Execution**:
   - Refactored `ReconciliationPage.tsx` to extract generic functions (`cleanStr`) outside the React lifecycle.
   - Wrapped `tableData`, `invoiceKeys`, `matched`, and `mismatched` arrays in strict `useMemo` hooks.
   - Wrapped critical `fetch` handlers (`handleFileUpload`, `handleDeepMatch`) in `useCallback`.
   - Memoized the Tax Liability Predictor calculations in `DashboardPage.tsx` to ensure snappy UI feedback.