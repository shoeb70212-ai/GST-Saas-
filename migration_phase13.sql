-- migration_phase13.sql
-- Add processing status for bulk ZIP async processing

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS error_message TEXT;
