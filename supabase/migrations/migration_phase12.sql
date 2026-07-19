-- Migration Phase 12: Missing Batch 1 Columns
-- Add expense_category and extraction_state to invoices table

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expense_category TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extraction_state TEXT;
