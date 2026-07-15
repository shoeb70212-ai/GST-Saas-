-- Phase 35: Tax Liability Predictor and Sales Records
-- Enables parsing of GSTR-1 Excel for accurate Output Tax calculation and Carry-Forward ITC

CREATE TABLE IF NOT EXISTS sales_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  invoice_type TEXT DEFAULT 'B2B', -- B2B, B2C, Credit Note
  customer_gstin TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  taxable_value DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  is_credit_note BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own sales_records" ON sales_records FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sales_records_client_period ON sales_records(client_id, period);

-- The complex RPC to calculate Current Liability and Carry-Forward ITC
CREATE OR REPLACE FUNCTION get_tax_liability_prediction(client_id_param UUID, period_param TEXT)
RETURNS JSON AS $$
DECLARE
  -- Target period variables
  current_sales_tax DECIMAL := 0;
  current_eligible_itc DECIMAL := 0;
  
  -- Historical variables
  historical_sales_tax DECIMAL := 0;
  historical_eligible_itc DECIMAL := 0;
  carry_forward_itc DECIMAL := 0;

  final_liability DECIMAL := 0;
BEGIN
  -- 1. Calculate Current Month Output Tax (Sales)
  -- Summing IGST + CGST + SGST
  SELECT COALESCE(SUM(igst + cgst + sgst), 0)
  INTO current_sales_tax
  FROM sales_records
  WHERE client_id = client_id_param AND period = period_param;

  -- 2. Calculate Current Month Eligible ITC (Purchases Matched)
  SELECT COALESCE(SUM(igst_amount + cgst_amount + sgst_amount), 0)
  INTO current_eligible_itc
  FROM invoices
  WHERE client_id = client_id_param AND recon_period = period_param AND recon_status = 'matched';

  -- 3. Calculate Historical (Prior to target period) Sales and ITC to find carry-forward
  -- Note: periods are string 'MM-YYYY'. To compare chronologically, we must convert to dates.
  -- We'll assume any record where to_date(period, 'MM-YYYY') < to_date(period_param, 'MM-YYYY') is historical.
  
  SELECT COALESCE(SUM(igst + cgst + sgst), 0)
  INTO historical_sales_tax
  FROM sales_records
  WHERE client_id = client_id_param AND to_date(period, 'MM-YYYY') < to_date(period_param, 'MM-YYYY');

  SELECT COALESCE(SUM(igst_amount + cgst_amount + sgst_amount), 0)
  INTO historical_eligible_itc
  FROM invoices
  WHERE client_id = client_id_param AND recon_status = 'matched' AND to_date(recon_period, 'MM-YYYY') < to_date(period_param, 'MM-YYYY');

  carry_forward_itc := historical_eligible_itc - historical_sales_tax;
  IF carry_forward_itc < 0 THEN
      carry_forward_itc := 0; -- We don't carry forward liabilities in this simple model, only excess ITC
  END IF;

  -- 4. Calculate Final Cash Liability
  final_liability := current_sales_tax - (current_eligible_itc + carry_forward_itc);
  IF final_liability < 0 THEN
      final_liability := 0;
  END IF;

  RETURN json_build_object(
    'current_sales_tax', current_sales_tax,
    'current_eligible_itc', current_eligible_itc,
    'carry_forward_itc', carry_forward_itc,
    'final_liability', final_liability
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
