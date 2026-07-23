-- Phase 79: mark invoice provenance (scan vs import) + teach save_invoice_atomic
-- to read invoice_data->>'source'.
--
-- Milestone 1 ("Reconcile without scanning"): the Purchase-Register importer
-- writes rows via the SAME save_invoice_atomic RPC as the scan flow. This adds a
-- `source` column (default 'scan' so every existing caller/row is unaffected) and
-- extends the RPC to persist it. Fully additive + idempotent.
--
-- NOTE: not yet applied to remote Supabase — apply via the Supabase SQL editor
-- or `supabase db push` during the next migration window.

-- 1. Provenance column (default keeps all existing rows + scan callers unchanged)
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scan';

-- Constrain to known channels (idempotent: only add if missing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoices_source_check'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT invoices_source_check
            CHECK (source IN ('scan', 'import', 'portal', 'whatsapp'));
    END IF;
END $$;

-- 2. Extend save_invoice_atomic to persist source (defaults to 'scan').
--    Body mirrors migration_phase58_client_and_invoice_rpc_fix.sql with the
--    single additive change of `source` in the INSERT column + values lists.
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
        original_invoice_number, original_invoice_date, approval_status, extraction_state,
        source
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
        COALESCE(NULLIF(invoice_data->>'extraction_state', ''), 'auto_accepted'),
        COALESCE(NULLIF(invoice_data->>'source', ''), 'scan')
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

-- Optional (deferred): natural-key index if app-level dedupe proves slow at scale
-- CREATE INDEX IF NOT EXISTS idx_invoices_client_gstin_invno
--     ON invoices (client_id, supplier_gstin, invoice_number);
