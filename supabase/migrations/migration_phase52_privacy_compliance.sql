-- migration_phase52_privacy_compliance.sql
-- Privacy Compliance: Data Minimization, PII Masking, and Consent Tracking

-- =====================================================================================
-- 1. Consent Tracking Table
-- =====================================================================================
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL, -- e.g., 'terms_of_service', 'data_processing_agreement', 'marketing'
    version TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own consents" ON consent_records
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own consents" ON consent_records
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_org_id ON consent_records(org_id);

-- =====================================================================================
-- 2. PII Masking in Audit Logs
-- =====================================================================================
-- Replace the trigger from Phase 38 with a privacy-preserving version.
-- Instead of logging full row_to_json(NEW), we omit sensitive fields.

CREATE OR REPLACE FUNCTION mask_invoice_pii(row_data JSONB)
RETURNS JSONB AS $$
BEGIN
    -- Remove Highly Sensitive / PII fields from audit logs
    RETURN row_data - 'supplier_gstin' - 'supplier_name' - 'buyer_gstin' - 'buyer_name' - 'document_url';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_invoices ON invoices;
CREATE TRIGGER trigger_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE PROCEDURE log_invoice_changes_masked();

-- =====================================================================================
-- 3. Data Retention / Deletion Helper
-- =====================================================================================
-- Function that can be called by a cron job or background worker to delete old audit logs
-- and orphaned whatsapp files (Data Minimization Principle).
CREATE OR REPLACE FUNCTION run_privacy_data_retention()
RETURNS VOID AS $$
BEGIN
    -- Delete audit logs older than 90 days (standard retention)
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Delete WhatsApp pending files older than 7 days (transitory data)
    DELETE FROM whatsapp_pending_files WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
