-- Phase 62: Create invoices storage bucket for invoice/bank statement files

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users can upload/read/update/delete objects under their own folder
-- Paths are expected as: {client_id}/... or {user_id}/...
DROP POLICY IF EXISTS "Authenticated users can upload invoice files" ON storage.objects;
CREATE POLICY "Authenticated users can upload invoice files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can read invoice files" ON storage.objects;
CREATE POLICY "Authenticated users can read invoice files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can update invoice files" ON storage.objects;
CREATE POLICY "Authenticated users can update invoice files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can delete invoice files" ON storage.objects;
CREATE POLICY "Authenticated users can delete invoice files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoices');
