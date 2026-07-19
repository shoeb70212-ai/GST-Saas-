-- 1. Create the new Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add client_id to the Invoices table
ALTER TABLE invoices ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- 3. Enable RLS on clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 4. Add RLS Policies for clients
CREATE POLICY "Users can insert their own clients" 
  ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own clients" 
  ON clients FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
  ON clients FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
  ON clients FOR DELETE USING (auth.uid() = user_id);
