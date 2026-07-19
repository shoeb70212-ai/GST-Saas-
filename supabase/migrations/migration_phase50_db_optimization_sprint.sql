-- Phase 50: Advanced Database Optimizations (Multi-Agent Sprint - Phase 1)

-- 1. Expression Indexes for Advanced Analytics
-- The get_advanced_analytics RPC groups by COALESCE expressions. Standard indexes do not cover this efficiently.
-- Adding expression indexes directly matches the query planner's needs.

CREATE INDEX IF NOT EXISTS idx_invoices_analytics_category 
ON invoices (client_id, user_id, COALESCE(expense_category, 'Uncategorized'));

CREATE INDEX IF NOT EXISTS idx_invoices_analytics_vendor 
ON invoices (client_id, user_id, COALESCE(supplier_name, 'Unknown Vendor'));

CREATE INDEX IF NOT EXISTS idx_invoices_analytics_recon 
ON invoices (client_id, user_id, COALESCE(recon_status, 'unreconciled'));

CREATE INDEX IF NOT EXISTS idx_invoices_total_amount 
ON invoices ( (COALESCE(total_amount, 0)) );

CREATE INDEX IF NOT EXISTS idx_invoices_taxable_amount 
ON invoices ( (COALESCE(taxable_amount, 0)) );

-- 2. Indexes for GSTR-2B Reconciliation speedups
-- The frontend often filters matches by 'SUGGESTED' or 'APPROVED' status for a specific client.
CREATE INDEX IF NOT EXISTS idx_reconciliation_client_status 
ON reconciliation_matches(client_id, status);

-- 3. Composite Index for sorting and pagination on SavedInvoicesPage
-- The frontend typically lists invoices sorted by created_at DESC or invoice_date DESC.
CREATE INDEX IF NOT EXISTS idx_invoices_client_created_at
ON invoices(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_client_date
ON invoices(client_id, invoice_date DESC);
