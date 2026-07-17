-- =====================================================================================
-- Migration Phase 40: Add GSTIN Status Column to Invoices
-- =====================================================================================

-- This fixes the frontend Analytics page crash caused by the missing column.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_gstin_status JSONB;
