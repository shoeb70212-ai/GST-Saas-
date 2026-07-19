-- Phase 27: The Bridge (Public Uploads Optimization)
-- Adding columns for deduplication and storage tracking

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Create an index for fast deduplication checks
CREATE INDEX IF NOT EXISTS idx_invoices_file_hash ON invoices(client_id, file_hash);
