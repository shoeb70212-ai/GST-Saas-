-- Phase 30: Virtual CFO Pillar (Maker-Checker, Price Variance, Item Spend)

-- 1. Maker-Checker Schema
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS maker_checker_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending_approval' CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));

-- Ensure older invoices are approved by default to not break existing data
UPDATE invoices SET approval_status = 'approved' WHERE approval_status = 'pending_approval';

-- 2. Itemized Spend Analytics RPC
CREATE OR REPLACE FUNCTION get_itemized_spend(client_id_param UUID, user_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    items_json JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO items_json
    FROM (
        SELECT 
            li.description,
            SUM(li.amount) as total_spend,
            SUM(li.quantity) as total_quantity
        FROM invoice_line_items li
        JOIN invoices i ON i.id = li.invoice_id
        WHERE i.client_id = client_id_param 
          AND i.user_id = user_id_param
          AND li.description IS NOT NULL
        GROUP BY li.description
        ORDER BY total_spend DESC
        LIMIT 10
    ) t;
    
    RETURN items_json;
END;
$$;

-- 3. Price Variance Alerts RPC
-- Flags items where the most recent unit price is >5% higher than the avg of the previous 3 months
CREATE OR REPLACE FUNCTION get_price_variance_alerts(client_id_param UUID, user_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    alerts_json JSONB;
BEGIN
    WITH item_history AS (
        SELECT 
            li.description,
            i.supplier_name,
            i.supplier_gstin,
            li.unit_price,
            i.invoice_date,
            ROW_NUMBER() OVER (PARTITION BY li.description, i.supplier_gstin ORDER BY i.invoice_date DESC) as rn
        FROM invoice_line_items li
        JOIN invoices i ON i.id = li.invoice_id
        WHERE i.client_id = client_id_param 
          AND i.user_id = user_id_param
          AND li.unit_price > 0
          AND i.supplier_gstin IS NOT NULL
          AND li.description IS NOT NULL
    ),
    latest_prices AS (
        SELECT * FROM item_history WHERE rn = 1
    ),
    historical_avg AS (
        SELECT 
            description, 
            supplier_gstin, 
            AVG(unit_price) as avg_price 
        FROM item_history 
        WHERE rn > 1 AND invoice_date >= (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY description, supplier_gstin
    )
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO alerts_json
    FROM (
        SELECT 
            lp.description as item_name,
            lp.supplier_name as vendor_name,
            lp.unit_price as current_price,
            ROUND(ha.avg_price, 2) as historical_average,
            ROUND(((lp.unit_price - ha.avg_price) / ha.avg_price * 100), 2) as variance_percentage
        FROM latest_prices lp
        JOIN historical_avg ha ON lp.description = ha.description AND lp.supplier_gstin = ha.supplier_gstin
        WHERE ha.avg_price > 0 AND lp.unit_price > (ha.avg_price * 1.05) -- > 5% increase
        ORDER BY variance_percentage DESC
    ) t;

    RETURN alerts_json;
END;
$$;

-- 4. Update save_invoice_atomic to handle approval_status
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
    is_maker_checker_enabled BOOLEAN;
BEGIN
    SELECT maker_checker_enabled INTO is_maker_checker_enabled FROM profiles WHERE id = (invoice_data->>'user_id')::UUID;

    -- Insert invoice
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
        original_invoice_number, original_invoice_date, approval_status
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
        invoice_data->>'expense_category',
        invoice_data->>'invoice_type',
        (invoice_data->>'reverse_charge_applicable')::BOOLEAN,
        (invoice_data->>'cess_amount')::DECIMAL,
        invoice_data->>'irn',
        invoice_data->>'original_invoice_number',
        (invoice_data->>'original_invoice_date')::DATE,
        CASE WHEN is_maker_checker_enabled THEN 'pending_approval' ELSE 'approved' END
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
