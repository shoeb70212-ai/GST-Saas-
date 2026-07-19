-- Phase 14: Database Optimization and Indexing
-- These indexes prevent full-table scans during the reconciliation process

-- 1. Index for client_id and period (used in fetching GSTR-2B records for reconciliation)
CREATE INDEX IF NOT EXISTS idx_gstr2b_client_period ON public.gstr2b_records(client_id, period);

-- 2. Index for supplier_gstin and invoice_number (used in matching logic)
CREATE INDEX IF NOT EXISTS idx_gstr2b_supplier_inv ON public.gstr2b_records(supplier_gstin, invoice_number);

-- 3. Ensure INSERT has explicit WITH CHECK constraint for RLS on gstr2b_records
DROP POLICY IF EXISTS "Users can manage their own gstr2b_records" ON public.gstr2b_records;

CREATE POLICY "Users can manage their own gstr2b_records" 
ON public.gstr2b_records 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
