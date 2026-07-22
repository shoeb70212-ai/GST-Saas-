-- Phase 72: Restore missing mask_invoice_pii used by invoice audit trigger
-- Symptom: INSERT into invoices fails with:
--   function mask_invoice_pii(jsonb) does not exist (42883)
-- Cause: Phase 59 re-applied log_invoice_changes_masked() which calls
--   mask_invoice_pii, but Phase 52's function was never applied (or was dropped).

CREATE OR REPLACE FUNCTION public.mask_invoice_pii(row_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    -- Strip sensitive fields from audit_logs payloads
    RETURN row_data
        - 'supplier_gstin'
        - 'supplier_name'
        - 'buyer_gstin'
        - 'buyer_name'
        - 'document_url'
        - 'supplier_pan'
        - 'buyer_pan'
        - 'account_number'
        - 'ifsc_code'
        - 'upi_id';
END;
$$;

-- Ensure the masked invoice audit trigger is present and points at a complete function
CREATE OR REPLACE FUNCTION public.log_invoice_changes_masked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    action_type TEXT;
    old_masked JSONB;
    new_masked JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'INSERT_INVOICE';
        new_masked := mask_invoice_pii(to_jsonb(NEW));
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, new_state)
        VALUES (NEW.org_id, current_user_id, action_type, 'invoices', NEW.id, new_masked);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'UPDATE_INVOICE';
        old_masked := mask_invoice_pii(to_jsonb(OLD));
        new_masked := mask_invoice_pii(to_jsonb(NEW));
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state, new_state)
        VALUES (NEW.org_id, current_user_id, action_type, 'invoices', NEW.id, old_masked, new_masked);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'DELETE_INVOICE';
        old_masked := mask_invoice_pii(to_jsonb(OLD));
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state)
        VALUES (OLD.org_id, current_user_id, action_type, 'invoices', OLD.id, old_masked);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_invoices ON invoices;
CREATE TRIGGER trigger_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE PROCEDURE log_invoice_changes_masked();

GRANT EXECUTE ON FUNCTION public.mask_invoice_pii(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_invoice_pii(JSONB) TO service_role;
