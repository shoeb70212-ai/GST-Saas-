-- Migration Script: Phase 10 (Fixes & Optimizations)

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_id_gstin'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT unique_user_id_gstin UNIQUE (user_id, gstin);
  END IF;
END $$;

-- 2. Convert Dates Safely
CREATE OR REPLACE FUNCTION safe_cast_date(text_val text) RETURNS DATE AS $$
BEGIN
  RETURN text_val::DATE;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE invoices ALTER COLUMN invoice_date TYPE DATE USING safe_cast_date(invoice_date::text);
ALTER TABLE invoices ALTER COLUMN due_date TYPE DATE USING safe_cast_date(due_date::text);
DROP FUNCTION safe_cast_date(text);

-- 3. Add Missing Columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_math_valid BOOLEAN GENERATED ALWAYS AS (
    round(COALESCE(taxable_amount, 0) + COALESCE(cgst_amount, 0) + COALESCE(sgst_amount, 0) + COALESCE(igst_amount, 0) + COALESCE(round_off, 0), 2) = round(COALESCE(total_amount, 0), 2)
) STORED;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recon_status TEXT CHECK (recon_status IN ('unreconciled', 'matched', 'mismatch', 'missing_in_2b', 'missing_in_pr'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recon_period TEXT;

-- 4. Missing Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_gstin ON invoices(supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_id_user_id ON invoices(id, user_id);

-- 5. Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clients_updated_at') THEN
    CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_invoices_updated_at') THEN
    CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END $$;

-- 6. Atomic Credit Deduction RPC
CREATE OR REPLACE FUNCTION decrement_credits(user_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  UPDATE profiles
  SET credits = credits - 1
  WHERE id = user_id_param AND credits > 0
  RETURNING credits INTO current_credits;
  
  RETURN COALESCE(current_credits, -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. GSTR-2B Records Table
CREATE TABLE IF NOT EXISTS gstr2b_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  supplier_gstin TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  taxable_value DECIMAL(12,2),
  igst DECIMAL(12,2),
  cgst DECIMAL(12,2),
  sgst DECIMAL(12,2),
  itc_available TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gstr2b_records ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'gstr2b_records' AND policyname = 'Users can manage their own gstr2b_records'
  ) THEN
      CREATE POLICY "Users can manage their own gstr2b_records" ON gstr2b_records FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
-- Migration Phase 11: Core Database Optimizations & Anomaly Detection

-- 1. Add retry_count to invoices table to track failed scans
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- 2. Add composite index for faster dashboard filtering (client + date)
CREATE INDEX IF NOT EXISTS idx_invoices_client_date ON invoices(client_id, invoice_date);

-- 3. Duplicate Invoice Blocker
-- We want to prevent the exact same invoice from being scanned twice for the same client.
-- NULL values in invoice_number or supplier_gstin bypass the UNIQUE constraint in Postgres,
-- which is acceptable because if the AI fails to extract them, they are manual review items anyway.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS unique_client_supplier_invoice;
ALTER TABLE invoices ADD CONSTRAINT unique_client_supplier_invoice UNIQUE NULLS NOT DISTINCT (client_id, supplier_gstin, invoice_number);

-- 4. Anomaly Detection Function (Z-Score)
-- Detects invoices that are unusually large compared to the historical average for that supplier.
CREATE OR REPLACE FUNCTION get_invoice_anomalies(client_id_param UUID, threshold_z_score DECIMAL DEFAULT 2.5)
RETURNS TABLE (
    invoice_id UUID,
    supplier_name TEXT,
    supplier_gstin TEXT,
    invoice_date DATE,
    total_amount DECIMAL,
    avg_amount DECIMAL,
    stddev_amount DECIMAL,
    z_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH supplier_stats AS (
        SELECT 
            i.supplier_gstin,
            AVG(i.total_amount) AS avg_amt,
            STDDEV_SAMP(i.total_amount) AS stddev_amt,
            COUNT(*) as invoice_count
        FROM invoices i
        WHERE i.client_id = client_id_param 
          AND i.supplier_gstin IS NOT NULL
          AND i.total_amount IS NOT NULL
        GROUP BY i.supplier_gstin
        HAVING COUNT(*) >= 3 -- Need at least 3 invoices to have a meaningful stddev
    )
    SELECT 
        inv.id AS invoice_id,
        inv.supplier_name,
        inv.supplier_gstin,
        inv.invoice_date,
        inv.total_amount,
        ROUND(stat.avg_amt, 2) AS avg_amount,
        ROUND(COALESCE(stat.stddev_amt, 0), 2) AS stddev_amount,
        ROUND(
            CASE 
                WHEN COALESCE(stat.stddev_amt, 0) = 0 THEN 0 
                ELSE (inv.total_amount - stat.avg_amt) / stat.stddev_amt 
            END, 
        2) AS z_score
    FROM invoices inv
    JOIN supplier_stats stat ON inv.supplier_gstin = stat.supplier_gstin
    WHERE inv.client_id = client_id_param
      AND inv.total_amount IS NOT NULL
      AND (
          (COALESCE(stat.stddev_amt, 0) > 0 AND (inv.total_amount - stat.avg_amt) / stat.stddev_amt >= threshold_z_score)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Migration Phase 12: Missing Batch 1 Columns
-- Add expense_category and extraction_state to invoices table

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expense_category TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extraction_state TEXT;
-- migration_phase13.sql
-- Add processing status for bulk ZIP async processing

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS error_message TEXT;
