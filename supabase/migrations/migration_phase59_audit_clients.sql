-- Phase 59: Expand firm audit coverage (clients) and ensure invoice audit trigger is active

CREATE OR REPLACE FUNCTION log_client_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID := auth.uid();
    action_type TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'INSERT_CLIENT';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, new_state)
        VALUES (NEW.org_id, current_user_id, action_type, 'clients', NEW.id, to_jsonb(NEW) - 'gstin' - 'pan');
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'UPDATE_CLIENT';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state, new_state)
        VALUES (
            NEW.org_id,
            current_user_id,
            action_type,
            'clients',
            NEW.id,
            to_jsonb(OLD) - 'gstin' - 'pan',
            to_jsonb(NEW) - 'gstin' - 'pan'
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'DELETE_CLIENT';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state)
        VALUES (OLD.org_id, current_user_id, action_type, 'clients', OLD.id, to_jsonb(OLD) - 'gstin' - 'pan');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_audit_clients ON clients;
CREATE TRIGGER trigger_audit_clients
AFTER INSERT OR UPDATE OR DELETE ON clients
FOR EACH ROW EXECUTE PROCEDURE log_client_changes();

-- Re-apply masked invoice audit trigger (idempotent)
CREATE OR REPLACE FUNCTION log_invoice_changes_masked()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_audit_invoices ON invoices;
CREATE TRIGGER trigger_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE PROCEDURE log_invoice_changes_masked();
