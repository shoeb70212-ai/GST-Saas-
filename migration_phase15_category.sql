-- Phase 15: Add AI Category to Invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expense_category TEXT;
