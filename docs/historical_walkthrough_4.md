   - Cleaned up E2E tests and context providers by prefixing unused error variables with underscores or disabling strict lint rules where React paradigms override them.

## Master Plan Execution: Phase 2 (Database & Backend Optimization)
1. **Analysis**: Audited `supabase_schema.sql` and migration scripts.
2. **Issue Mapping**: Identified search path vulnerabilities in `SECURITY DEFINER` RPCs, missing indices on the `gstr2b_records` table, and missing `WITH CHECK` boundaries on RLS policies.
3. **Execution**:
   - Generated `migration_phase31_db_optimizations.sql` containing fixes.
   - The script sets `search_path = public` on elevated functions, adds `idx_gstr2b_client_period` to prevent Sequential Scans, and strictly applies `WITH CHECK` clauses for `gstr2b_records` and `invoice_line_items`.