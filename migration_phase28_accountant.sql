-- Phase 28: Accountant Optimization Sprint
-- Adding custom Tally ledgers to profiles and HSN audit warnings to invoices

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tally_ledgers JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hsn_audit_warning TEXT;
