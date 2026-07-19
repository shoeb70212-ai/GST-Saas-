-- Phase 26: Enable Realtime UI Updates for Batch ZIP Uploads

-- 1. Enable the Supabase Realtime publication for the invoices table
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;

-- 2. Ensure the full row is broadcasted to the frontend when an update occurs
ALTER TABLE invoices REPLICA IDENTITY FULL;
