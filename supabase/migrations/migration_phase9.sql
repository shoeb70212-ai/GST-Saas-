-- Migration Script: Phase 9 (Scale & Performance)

-- Create B-Tree indexes on the foreign keys in the invoices table.
-- This ensures that as the table grows to millions of rows, filtering by user or client remains instant.

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);

-- Also add an index on the created_at column since we frequently order by it
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
