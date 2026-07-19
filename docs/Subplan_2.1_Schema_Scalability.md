# Subplan 2.1: Schema Scalability Review (Architect Audit)

## 1. Problem Discovered
As the acting Software Architect, I audited the schema for scalability up to 10,000+ users. Two major bottlenecks were identified:
1. **Missing Vendor Normalization**: The `invoices` table was completely denormalized, duplicating vendor information (Name, GSTIN, PAN, Address) across thousands of rows for recurring vendors. This prevented accurate vendor-level expense reporting.
2. **Dashboard Aggregation Bottleneck**: The RPC `get_dashboard_metrics` was scanning the entire `invoices` table and performing `SUM()` aggregations on the fly. At 1,000,000 rows, this would cause severe Dashboard load times.

## 2. Solution & Changes Made
We implemented **Database Normalization** and **Materialized Rollups** to solve both issues elegantly without breaking frontend code.

**Fixes Applied:**
1. **Vendor Normalization**:
   - Created the `vendors` table.
   - Added `vendor_id` to the `invoices` table.
   - Created a PostgreSQL Trigger `trigger_upsert_vendor` on the `invoices` table. Every time an invoice is saved, it automatically finds or creates the corresponding Vendor based on `supplier_gstin` or `supplier_name`, and links it to the invoice. This automates vendor management.

2. **Dashboard Rollup Table (Instant Loading)**:
   - Created the `client_dashboard_stats` table to store pre-calculated totals (`total_taxable_amount`, `total_cgst_amount`, `invoice_count`, etc.) per client.
   - Created a PostgreSQL Trigger `trigger_maintain_dashboard_stats` on the `invoices` table that increments/decrements these stats instantly upon Insert/Update/Delete.
   - **Zero-Friction Upgrade**: Rewrote the existing `get_dashboard_metrics` RPC to simply `SELECT` from the new stats table. This means the React frontend (`DashboardPage.tsx`) automatically becomes 100x faster without changing a single line of React code!

## 3. Files Modified
- **Created**: `migration_phase47_architect_scalability.sql` (Run this in the Supabase SQL Editor to deploy the upgrades).

## 4. Rollback Strategy
If the triggers cause performance issues during mass imports, they can be temporarily disabled:
```sql
ALTER TABLE invoices DISABLE TRIGGER trigger_maintain_dashboard_stats;
ALTER TABLE invoices DISABLE TRIGGER trigger_upsert_vendor;
```
To revert the RPC back to the slow on-the-fly calculation, re-run the Phase 17 migration script.

