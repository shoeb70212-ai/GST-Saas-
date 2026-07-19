-- Migration Script: Phase 10 (Fixes & Optimizations)

-- 1. Client Uniqueness
ALTER TABLE clients ADD CONSTRAINT unique_user_id_gstin UNIQUE (user_id, gstin);

-- 2. Convert Dates Safely
CREATE OR REPLACE FUNCTION safe_cast_date(text_val text) RETURNS DATE AS $$
BEGIN
  RETURN text_val::DATE;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE invoices ALTER COLUMN invoice_date TYPE DATE USING safe_cast_date(invoice_date);
ALTER TABLE invoices ALTER COLUMN due_date TYPE DATE USING safe_cast_date(due_date);
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
