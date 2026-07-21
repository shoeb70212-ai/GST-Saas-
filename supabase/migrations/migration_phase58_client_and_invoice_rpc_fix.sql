-- Phase 58: Reliable client creation + invoice save fixes
-- 1. create_client_secure RPC bypasses flaky direct-insert RLS path
-- 2. save_invoice_atomic safe casts prevent empty-string boolean/date failures
-- 3. Back-fill active_org_id for any user missing it

-- Helper: safe boolean cast (empty string -> NULL, never throws)
CREATE OR REPLACE FUNCTION public.safe_json_bool(val TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF val IS NULL OR btrim(val) = '' THEN
        RETURN NULL;
    END IF;
    RETURN val::BOOLEAN;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Helper: safe date cast
CREATE OR REPLACE FUNCTION public.safe_json_date(val TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF val IS NULL OR btrim(val) = '' THEN
        RETURN NULL;
    END IF;
    RETURN val::DATE;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Back-fill active_org_id
DO $$
DECLARE
    r RECORD;
    their_org_id UUID;
BEGIN
    FOR r IN SELECT p.id FROM public.profiles p WHERE p.active_org_id IS NULL
    LOOP
        SELECT om.org_id INTO their_org_id
        FROM public.organization_members om
        WHERE om.user_id = r.id
        ORDER BY om.created_at ASC
        LIMIT 1;

        IF their_org_id IS NULL THEN
            SELECT o.id INTO their_org_id
            FROM public.organizations o
            WHERE o.owner_id = r.id
            LIMIT 1;
        END IF;

        IF their_org_id IS NOT NULL THEN
            UPDATE public.profiles SET active_org_id = their_org_id WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$;

-- Ensure org trigger respects frontend-provided org_id
CREATE OR REPLACE FUNCTION set_default_org_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT active_org_id INTO NEW.org_id FROM profiles WHERE id = auth.uid();

    IF NEW.org_id IS NULL THEN
        SELECT id INTO NEW.org_id FROM organizations WHERE owner_id = auth.uid() LIMIT 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Broaden client insert policy (idempotent)
DROP POLICY IF EXISTS "Admins can insert clients" ON clients;
DROP POLICY IF EXISTS "Org members can insert clients" ON clients;
CREATE POLICY "Org members can insert clients" ON clients
FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM get_user_orgs())
);

-- Secure client creation RPC (bypasses RLS, validates auth internally)
CREATE OR REPLACE FUNCTION public.create_client_secure(
    p_client_name TEXT,
    p_gstin TEXT DEFAULT NULL,
    p_pan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_client clients%ROWTYPE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_client_name IS NULL OR btrim(p_client_name) = '' THEN
        RAISE EXCEPTION 'Client name is required';
    END IF;

    SELECT org_id INTO v_org_id FROM get_user_orgs() LIMIT 1;
    IF v_org_id IS NULL THEN
        v_org_id := ensure_user_org();
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found for user';
    END IF;

    UPDATE profiles SET active_org_id = v_org_id WHERE id = v_user_id;

    INSERT INTO clients (user_id, org_id, client_name, gstin, pan)
    VALUES (
        v_user_id,
        v_org_id,
        btrim(p_client_name),
        NULLIF(btrim(p_gstin), ''),
        NULLIF(btrim(p_pan), '')
    )
    RETURNING * INTO v_client;

    RETURN to_jsonb(v_client);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_secure(TEXT, TEXT, TEXT) TO authenticated;

-- Fix save_invoice_atomic with safe casts + extraction_state
CREATE OR REPLACE FUNCTION save_invoice_atomic(
    invoice_data JSONB,
    line_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_invoice_id UUID;
    item JSONB;
    is_maker_checker_enabled BOOLEAN;
    req_user_id UUID;
    req_client_id UUID;
BEGIN
    req_user_id := (invoice_data->>'user_id')::UUID;
    req_client_id := NULLIF(invoice_data->>'client_id', '')::UUID;

    IF req_user_id IS NULL OR req_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Cannot save invoice for another user.';
    END IF;

    IF req_client_id IS NULL THEN
        RAISE EXCEPTION 'Client is required';
    END IF;

    IF NOT has_client_access(req_client_id) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this client.';
    END IF;

    SELECT maker_checker_enabled INTO is_maker_checker_enabled FROM profiles WHERE id = req_user_id;

    INSERT INTO invoices (
        user_id, client_id, file_name, supplier_name, supplier_address, supplier_phone,
        supplier_email, supplier_gstin, supplier_pan, buyer_name, buyer_address,
        buyer_pin, buyer_gstin, buyer_pan, place_of_supply, invoice_date, due_date,
        invoice_number, po_number, e_way_bill_number, vehicle_number, taxable_amount,
        cgst_amount, sgst_amount, igst_amount, round_off, total_amount, gst_amount,
        confidence_score, amount_in_words, received_amount, balance_amount,
        previous_balance, current_balance, account_holder, account_number,
        bank_name, branch_name, ifsc_code, upi_id, expense_category,
        invoice_type, reverse_charge_applicable, cess_amount, irn,
        original_invoice_number, original_invoice_date, approval_status, extraction_state
    ) VALUES (
        req_user_id,
        req_client_id,
        invoice_data->>'file_name',
        invoice_data->>'supplier_name',
        invoice_data->>'supplier_address',
        invoice_data->>'supplier_phone',
        invoice_data->>'supplier_email',
        invoice_data->>'supplier_gstin',
        invoice_data->>'supplier_pan',
        invoice_data->>'buyer_name',
        invoice_data->>'buyer_address',
        invoice_data->>'buyer_pin',
        invoice_data->>'buyer_gstin',
        invoice_data->>'buyer_pan',
        invoice_data->>'place_of_supply',
        safe_json_date(invoice_data->>'invoice_date'),
        safe_json_date(invoice_data->>'due_date'),
        invoice_data->>'invoice_number',
        invoice_data->>'po_number',
        invoice_data->>'e_way_bill_number',
        invoice_data->>'vehicle_number',
        NULLIF(invoice_data->>'taxable_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'cgst_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'sgst_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'igst_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'round_off', '')::DECIMAL,
        NULLIF(invoice_data->>'total_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'gst_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'confidence_score', '')::DECIMAL,
        invoice_data->>'amount_in_words',
        NULLIF(invoice_data->>'received_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'balance_amount', '')::DECIMAL,
        NULLIF(invoice_data->>'previous_balance', '')::DECIMAL,
        NULLIF(invoice_data->>'current_balance', '')::DECIMAL,
        invoice_data->>'account_holder',
        invoice_data->>'account_number',
        invoice_data->>'bank_name',
        invoice_data->>'branch_name',
        invoice_data->>'ifsc_code',
        invoice_data->>'upi_id',
        invoice_data->>'expense_category',
        invoice_data->>'invoice_type',
        safe_json_bool(invoice_data->>'reverse_charge_applicable'),
        NULLIF(invoice_data->>'cess_amount', '')::DECIMAL,
        invoice_data->>'irn',
        invoice_data->>'original_invoice_number',
        safe_json_date(invoice_data->>'original_invoice_date'),
        CASE WHEN COALESCE(is_maker_checker_enabled, FALSE) THEN 'pending_approval' ELSE 'approved' END,
        COALESCE(NULLIF(invoice_data->>'extraction_state', ''), 'auto_accepted')
    ) RETURNING id INTO new_invoice_id;

    IF line_items IS NOT NULL AND jsonb_array_length(line_items) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(line_items)
        LOOP
            INSERT INTO invoice_line_items (
                invoice_id, description, hsn_sac, quantity, unit_price, tax_rate, amount
            ) VALUES (
                new_invoice_id,
                item->>'description',
                item->>'hsn_sac',
                NULLIF(item->>'quantity', '')::DECIMAL,
                NULLIF(item->>'unit_price', '')::DECIMAL,
                NULLIF(item->>'tax_rate', '')::DECIMAL,
                NULLIF(item->>'amount', '')::DECIMAL
            );
        END LOOP;
    END IF;

    RETURN new_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_invoice_atomic(JSONB, JSONB) TO authenticated;
