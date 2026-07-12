ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_gstin_status TEXT;

CREATE TABLE IF NOT EXISTS gstin_cache (
  gstin TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  legal_name TEXT,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
