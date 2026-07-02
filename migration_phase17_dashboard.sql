-- Phase 17: Dashboard Aggregates RPC
CREATE OR REPLACE FUNCTION get_dashboard_metrics(client_id_param UUID, user_id_param UUID)
RETURNS TABLE (
    total_taxable_amount DECIMAL,
    total_cgst_amount DECIMAL,
    total_sgst_amount DECIMAL,
    total_igst_amount DECIMAL,
    total_outstanding DECIMAL,
    invoice_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(taxable_amount), 0) as total_taxable_amount,
        COALESCE(SUM(cgst_amount), 0) as total_cgst_amount,
        COALESCE(SUM(sgst_amount), 0) as total_sgst_amount,
        COALESCE(SUM(igst_amount), 0) as total_igst_amount,
        COALESCE(SUM(GREATEST(0, COALESCE(total_amount, 0) - COALESCE(received_amount, 0))), 0) as total_outstanding,
        COUNT(id) as invoice_count
    FROM invoices
    WHERE client_id = client_id_param AND user_id = user_id_param;
END;
$$;
