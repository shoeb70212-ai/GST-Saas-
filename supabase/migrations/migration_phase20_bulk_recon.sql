-- Phase 20: Bulk Update Invoices for Reconciliation
CREATE OR REPLACE FUNCTION bulk_update_invoices_recon(updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec JSONB;
BEGIN
    FOR rec IN SELECT * FROM jsonb_array_elements(updates)
    LOOP
        UPDATE invoices
        SET recon_status = rec->>'recon_status',
            recon_period = rec->>'recon_period'
        WHERE id = (rec->>'id')::UUID;
    END LOOP;
END;
$$;
