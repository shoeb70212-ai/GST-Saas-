-- Phase 18: Atomic Save Invoice RPC
CREATE OR REPLACE FUNCTION save_invoice_atomic(
    invoice_data JSONB,
    line_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_invoice_id UUID;
    item JSONB;
BEGIN
    -- Insert invoice
    INSERT INTO invoices (
        user_id, client_id, file_name, supplier_name, supplier_address, supplier_phone, 
        supplier_email, supplier_gstin, supplier_pan, buyer_name, buyer_address, 
        buyer_pin, buyer_gstin, buyer_pan, place_of_supply, invoice_date, due_date, 
        invoice_number, po_number, e_way_bill_number, vehicle_number, taxable_amount, 
        cgst_amount, sgst_amount, igst_amount, round_off, total_amount, gst_amount, 
        confidence_score, amount_in_words, received_amount, balance_amount, 
        previous_balance, current_balance, account_holder, account_number, 
        bank_name, branch_name, ifsc_code, upi_id, expense_category
    ) VALUES (
        (invoice_data->>'user_id')::UUID,
        (invoice_data->>'client_id')::UUID,
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
        (invoice_data->>'invoice_date')::DATE,
        (invoice_data->>'due_date')::DATE,
        invoice_data->>'invoice_number',
        invoice_data->>'po_number',
        invoice_data->>'e_way_bill_number',
        invoice_data->>'vehicle_number',
        (invoice_data->>'taxable_amount')::DECIMAL,
        (invoice_data->>'cgst_amount')::DECIMAL,
        (invoice_data->>'sgst_amount')::DECIMAL,
        (invoice_data->>'igst_amount')::DECIMAL,
        (invoice_data->>'round_off')::DECIMAL,
        (invoice_data->>'total_amount')::DECIMAL,
        (invoice_data->>'gst_amount')::DECIMAL,
        (invoice_data->>'confidence_score')::DECIMAL,
        invoice_data->>'amount_in_words',
        (invoice_data->>'received_amount')::DECIMAL,
        (invoice_data->>'balance_amount')::DECIMAL,
        (invoice_data->>'previous_balance')::DECIMAL,
        (invoice_data->>'current_balance')::DECIMAL,
        invoice_data->>'account_holder',
        invoice_data->>'account_number',
        invoice_data->>'bank_name',
        invoice_data->>'branch_name',
        invoice_data->>'ifsc_code',
        invoice_data->>'upi_id',
        invoice_data->>'expense_category'
    ) RETURNING id INTO new_invoice_id;

    -- Insert line items
    IF line_items IS NOT NULL AND jsonb_array_length(line_items) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(line_items)
        LOOP
            INSERT INTO invoice_line_items (
                invoice_id, description, hsn_sac, quantity, unit_price, tax_rate, amount
            ) VALUES (
                new_invoice_id,
                item->>'description',
                item->>'hsn_sac',
                (item->>'quantity')::DECIMAL,
                (item->>'unit_price')::DECIMAL,
                (item->>'tax_rate')::DECIMAL,
                (item->>'amount')::DECIMAL
            );
        END LOOP;
    END IF;

    RETURN new_invoice_id;
END;
$$;
