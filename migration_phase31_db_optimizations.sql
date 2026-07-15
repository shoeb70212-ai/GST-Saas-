-- Migration Script: Phase 31 (Database & Security Optimizations)

-- 1. Secure SECURITY DEFINER functions by setting search_path
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION decrement_credits(UUID) SET search_path = public;
ALTER FUNCTION get_invoice_anomalies(UUID, DECIMAL) SET search_path = public;

-- 2. Add Missing Performance Indexes for GSTR-2B
CREATE INDEX IF NOT EXISTS idx_gstr2b_client_period ON public.gstr2b_records(client_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_user_id ON public.gstr2b_records(user_id);

-- 3. Tighten Row Level Security (RLS) on gstr2b_records
DROP POLICY IF EXISTS "Users can manage their own gstr2b_records" ON public.gstr2b_records;
CREATE POLICY "Users can manage their own gstr2b_records" 
ON public.gstr2b_records 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 4. Tighten Row Level Security (RLS) on invoice_line_items UPDATE
DROP POLICY IF EXISTS "Users can update line items of their invoices" ON public.invoice_line_items;
CREATE POLICY "Users can update line items of their invoices" 
ON public.invoice_line_items 
FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
);
