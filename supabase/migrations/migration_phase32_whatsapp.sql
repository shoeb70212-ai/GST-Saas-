-- migration_phase32_whatsapp.sql

-- Add whatsapp_number column to profiles to link incoming messages
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20) UNIQUE;

-- Add active_whatsapp_client_id to default which client receives the WhatsApp uploaded invoices
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_whatsapp_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Create an index to quickly lookup user by whatsapp number
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_number ON profiles(whatsapp_number);
