-- migration_phase33_storage.sql

-- 1. Add file_url column to invoices table to store the public Supabase Storage URL
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 2. Create the conversational state machine table for password-protected PDFs
CREATE TABLE IF NOT EXISTS whatsapp_pending_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    whatsapp_number VARCHAR(20) NOT NULL,
    media_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups by whatsapp_number and recent created_at
CREATE INDEX IF NOT EXISTS idx_wa_pending_num_time ON whatsapp_pending_files(whatsapp_number, created_at);

-- IMPORTANT MANUAL STEPS FOR ADMIN:
-- 1. Create a Supabase Storage Bucket named "invoices"
-- 2. Set the Bucket to Public
-- 3. In Bucket settings, increase Maximum File Size to 25MB (25000000 bytes)
