-- Phase 47: Architect Scalability Upgrades (Vendor Normalization & Dashboard Rollups)

-- 1. Create Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gstin TEXT,
    pan TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, gstin) -- One vendor per GSTIN per client
);

-- RLS for Vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client's vendors"
ON vendors FOR SELECT
USING (EXISTS (
    SELECT 1 FROM client_users cu 
    WHERE cu.client_id = vendors.client_id 
    AND cu.user_id = auth.uid()
));

CREATE POLICY "Users can manage their client's vendors"
ON vendors FOR ALL
USING (EXISTS (
    SELECT 1 FROM client_users cu 
    WHERE cu.client_id = vendors.client_id 
    AND cu.user_id = auth.uid()
));

-- 2. Add vendor_id to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

-- 3. Trigger to Auto-Upsert Vendor from Invoice
CREATE OR REPLACE FUNCTION upsert_vendor_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor_id UUID;
BEGIN
    -- Only proceed if there is a GSTIN or PAN or Name
    IF NEW.supplier_gstin IS NOT NULL OR NEW.supplier_name IS NOT NULL THEN
        -- Try to find existing vendor by GSTIN for this client
        IF NEW.supplier_gstin IS NOT NULL THEN
            SELECT id INTO v_vendor_id FROM vendors 
            WHERE client_id = NEW.client_id AND gstin = NEW.supplier_gstin LIMIT 1;
        END IF;

        -- If not found by GSTIN, try by Name as fallback if GSTIN is null
        IF v_vendor_id IS NULL AND NEW.supplier_name IS NOT NULL AND NEW.supplier_gstin IS NULL THEN
            SELECT id INTO v_vendor_id FROM vendors 
            WHERE client_id = NEW.client_id AND name = NEW.supplier_name LIMIT 1;
        END IF;

        -- If still not found, create new vendor
        IF v_vendor_id IS NULL THEN
            INSERT INTO vendors (org_id, client_id, name, gstin, pan, address, phone, email)
            VALUES (
                NEW.org_id, 
                NEW.client_id, 
                COALESCE(NEW.supplier_name, 'Unknown Vendor'), 
                NEW.supplier_gstin, 
                NEW.supplier_pan, 
                NEW.supplier_address, 
                NEW.supplier_phone, 
                NEW.supplier_email
            )
            RETURNING id INTO v_vendor_id;
        ELSE
            -- Update existing vendor (optional: only if fields are null to prevent overwriting verified data)
            UPDATE vendors SET
                pan = COALESCE(vendors.pan, NEW.supplier_pan),
                address = COALESCE(vendors.address, NEW.supplier_address),
                phone = COALESCE(vendors.phone, NEW.supplier_phone),
                email = COALESCE(vendors.email, NEW.supplier_email),
                updated_at = NOW()
            WHERE id = v_vendor_id;
        END IF;

        -- Link invoice to vendor
        NEW.vendor_id := v_vendor_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_upsert_vendor ON invoices;
CREATE TRIGGER trigger_upsert_vendor
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION upsert_vendor_from_invoice();

-- 4. Dashboard Rollup Stats Table
CREATE TABLE IF NOT EXISTS client_dashboard_stats (
    client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    total_taxable_amount DECIMAL DEFAULT 0,
    total_cgst_amount DECIMAL DEFAULT 0,
    total_sgst_amount DECIMAL DEFAULT 0,
    total_igst_amount DECIMAL DEFAULT 0,
    total_outstanding DECIMAL DEFAULT 0,
    invoice_count BIGINT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for client_dashboard_stats
ALTER TABLE client_dashboard_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client stats"
ON client_dashboard_stats FOR SELECT
USING (EXISTS (
    SELECT 1 FROM client_users cu 
    WHERE cu.client_id = client_dashboard_stats.client_id 
    AND cu.user_id = auth.uid()
));

-- 5. Trigger to maintain dashboard stats
CREATE OR REPLACE FUNCTION maintain_dashboard_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO client_dashboard_stats (
            client_id, org_id, total_taxable_amount, total_cgst_amount, 
            total_sgst_amount, total_igst_amount, total_outstanding, invoice_count
        )
        VALUES (
            NEW.client_id, NEW.org_id, 
            COALESCE(NEW.taxable_amount, 0), COALESCE(NEW.cgst_amount, 0), 
            COALESCE(NEW.sgst_amount, 0), COALESCE(NEW.igst_amount, 0),
            GREATEST(0, COALESCE(NEW.total_amount, 0) - COALESCE(NEW.received_amount, 0)), 1
        )
        ON CONFLICT (client_id) DO UPDATE SET
            total_taxable_amount = client_dashboard_stats.total_taxable_amount + EXCLUDED.total_taxable_amount,
            total_cgst_amount = client_dashboard_stats.total_cgst_amount + EXCLUDED.total_cgst_amount,
            total_sgst_amount = client_dashboard_stats.total_sgst_amount + EXCLUDED.total_sgst_amount,
            total_igst_amount = client_dashboard_stats.total_igst_amount + EXCLUDED.total_igst_amount,
            total_outstanding = client_dashboard_stats.total_outstanding + EXCLUDED.total_outstanding,
            invoice_count = client_dashboard_stats.invoice_count + 1,
            last_updated = NOW();
            
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE client_dashboard_stats SET
            total_taxable_amount = total_taxable_amount - COALESCE(OLD.taxable_amount, 0) + COALESCE(NEW.taxable_amount, 0),
            total_cgst_amount = total_cgst_amount - COALESCE(OLD.cgst_amount, 0) + COALESCE(NEW.cgst_amount, 0),
            total_sgst_amount = total_sgst_amount - COALESCE(OLD.sgst_amount, 0) + COALESCE(NEW.sgst_amount, 0),
            total_igst_amount = total_igst_amount - COALESCE(OLD.igst_amount, 0) + COALESCE(NEW.igst_amount, 0),
            total_outstanding = total_outstanding - GREATEST(0, COALESCE(OLD.total_amount, 0) - COALESCE(OLD.received_amount, 0)) 
                                + GREATEST(0, COALESCE(NEW.total_amount, 0) - COALESCE(NEW.received_amount, 0)),
            last_updated = NOW()
        WHERE client_id = NEW.client_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE client_dashboard_stats SET
            total_taxable_amount = total_taxable_amount - COALESCE(OLD.taxable_amount, 0),
            total_cgst_amount = total_cgst_amount - COALESCE(OLD.cgst_amount, 0),
            total_sgst_amount = total_sgst_amount - COALESCE(OLD.sgst_amount, 0),
            total_igst_amount = total_igst_amount - COALESCE(OLD.igst_amount, 0),
            total_outstanding = total_outstanding - GREATEST(0, COALESCE(OLD.total_amount, 0) - COALESCE(OLD.received_amount, 0)),
            invoice_count = invoice_count - 1,
            last_updated = NOW()
        WHERE client_id = OLD.client_id;
    END IF;
    
    RETURN NULL; -- For AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trigger_maintain_dashboard_stats ON invoices;
CREATE TRIGGER trigger_maintain_dashboard_stats
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION maintain_dashboard_stats();

-- 6. Rewrite get_dashboard_metrics RPC to use the new fast table
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
    -- Only return if user has access to client
    IF EXISTS (SELECT 1 FROM client_users WHERE client_id = client_id_param AND user_id = user_id_param) THEN
        RETURN QUERY
        SELECT 
            cds.total_taxable_amount,
            cds.total_cgst_amount,
            cds.total_sgst_amount,
            cds.total_igst_amount,
            cds.total_outstanding,
            cds.invoice_count
        FROM client_dashboard_stats cds
        WHERE cds.client_id = client_id_param;
    END IF;
END;
$$;

-- 7. Initialize existing data into the stats table
INSERT INTO client_dashboard_stats (client_id, org_id, total_taxable_amount, total_cgst_amount, total_sgst_amount, total_igst_amount, total_outstanding, invoice_count)
SELECT 
    client_id,
    MAX(org_id),
    COALESCE(SUM(taxable_amount), 0),
    COALESCE(SUM(cgst_amount), 0),
    COALESCE(SUM(sgst_amount), 0),
    COALESCE(SUM(igst_amount), 0),
    COALESCE(SUM(GREATEST(0, COALESCE(total_amount, 0) - COALESCE(received_amount, 0))), 0),
    COUNT(id)
FROM invoices
GROUP BY client_id
ON CONFLICT (client_id) DO UPDATE SET
    total_taxable_amount = EXCLUDED.total_taxable_amount,
    total_cgst_amount = EXCLUDED.total_cgst_amount,
    total_sgst_amount = EXCLUDED.total_sgst_amount,
    total_igst_amount = EXCLUDED.total_igst_amount,
    total_outstanding = EXCLUDED.total_outstanding,
    invoice_count = EXCLUDED.invoice_count;
