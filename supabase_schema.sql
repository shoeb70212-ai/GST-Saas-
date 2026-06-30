-- Supabase Schema for PayForce (InvoiceScanner AI)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Clients Table (Multi-tenancy for accountants)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, gstin)
);

-- 2. Invoices Table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT,
  supplier_name TEXT,
  supplier_address TEXT,
  supplier_phone TEXT,
  supplier_email TEXT,
  supplier_gstin TEXT,
  supplier_pan TEXT,
  buyer_name TEXT,
  buyer_address TEXT,
  buyer_pin TEXT,
  buyer_gstin TEXT,
  buyer_pan TEXT,
  place_of_supply TEXT,
  invoice_date DATE,
  due_date DATE,
  invoice_number TEXT,
  po_number TEXT,
  e_way_bill_number TEXT,
  vehicle_number TEXT,
  taxable_amount DECIMAL(12,2),
  cgst_amount DECIMAL(12,2),
  sgst_amount DECIMAL(12,2),
  igst_amount DECIMAL(12,2),
  round_off DECIMAL(12,2),
  total_amount DECIMAL(12,2),
  gst_amount DECIMAL(12,2),
  gst_math_valid BOOLEAN GENERATED ALWAYS AS (
    round(COALESCE(taxable_amount, 0) + COALESCE(cgst_amount, 0) + COALESCE(sgst_amount, 0) + COALESCE(igst_amount, 0) + COALESCE(round_off, 0), 2) = round(COALESCE(total_amount, 0), 2)
  ) STORED,
  confidence_score DECIMAL(5,2),
  amount_in_words TEXT,
  received_amount DECIMAL(12,2),
  balance_amount DECIMAL(12,2),
  previous_balance DECIMAL(12,2),
  current_balance DECIMAL(12,2),
  account_holder TEXT,
  account_number TEXT,
  bank_name TEXT,
  branch_name TEXT,
  ifsc_code TEXT,
  upi_id TEXT,
  recon_status TEXT CHECK (recon_status IN ('unreconciled', 'matched', 'mismatch', 'missing_in_2b', 'missing_in_pr')),
  recon_period TEXT,
  processing_status TEXT DEFAULT 'completed',
  error_message TEXT,
  expense_category TEXT,
  extraction_state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Line Items Table
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT,
  hsn_sac TEXT,
  quantity DECIMAL(12,2),
  unit_price DECIMAL(12,2),
  tax_rate DECIMAL(5,2),
  amount DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row Level Security (RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policies for clients
CREATE POLICY "Users can insert their own clients" 
  ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own clients" 
  ON clients FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
  ON clients FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
  ON clients FOR DELETE USING (auth.uid() = user_id);
-- Policies for invoices
CREATE POLICY "Users can insert their own invoices" 
  ON invoices FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own invoices" 
  ON invoices FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices" 
  ON invoices FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices" 
  ON invoices FOR DELETE USING (auth.uid() = user_id);

-- Policies for line items
-- We map the access through the parent invoice table
CREATE POLICY "Users can insert line items for their invoices" 
  ON invoice_line_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can view line items of their invoices" 
  ON invoice_line_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update line items of their invoices" 
  ON invoice_line_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete line items of their invoices" 
  ON invoice_line_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

-- 4. Profiles Table (Credit Wallet & Settings)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  default_gstin TEXT,
  credits INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to create profile on user signup with 100 free credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, credits)
  VALUES (new.id, 100);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Missing Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_gstin ON invoices(supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_id_user_id ON invoices(id, user_id);

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Atomic Credit Deduction RPC
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

-- GSTR-2B Records Table
CREATE TABLE gstr2b_records (
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
CREATE POLICY "Users can manage their own gstr2b_records" ON gstr2b_records FOR ALL USING (auth.uid() = user_id);
