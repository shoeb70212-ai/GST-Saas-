-- Phase 25: Advanced Analytics Aggregations

-- 1. Create Indexes for Analytics Performance
CREATE INDEX IF NOT EXISTS idx_invoices_analytics 
ON invoices(client_id, user_id, invoice_date, expense_category);

CREATE INDEX IF NOT EXISTS idx_invoices_supplier 
ON invoices(client_id, user_id, supplier_name);

-- 2. Create RPC for Advanced Analytics returning a single JSONB
CREATE OR REPLACE FUNCTION get_advanced_analytics(client_id_param UUID, user_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    trends_json JSONB;
    categories_json JSONB;
    vendors_json JSONB;
    recon_json JSONB;
BEGIN
    -- 1. Trends: Spend over the last 6 months
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO trends_json
    FROM (
        SELECT 
            TO_CHAR(invoice_date, 'YYYY-MM') as month,
            SUM(total_amount) as total_spend,
            SUM(taxable_amount) as total_taxable
        FROM invoices
        WHERE client_id = client_id_param AND user_id = user_id_param
          AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
        GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
        ORDER BY TO_CHAR(invoice_date, 'YYYY-MM') ASC
    ) t;

    -- 2. Categories: Spend by category
    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO categories_json
    FROM (
        SELECT 
            COALESCE(expense_category, 'Uncategorized') as category,
            SUM(total_amount) as total_spend
        FROM invoices
        WHERE client_id = client_id_param AND user_id = user_id_param
        GROUP BY COALESCE(expense_category, 'Uncategorized')
        ORDER BY total_spend DESC
    ) c;

    -- 3. Top Vendors: Top 5 by spend
    SELECT COALESCE(jsonb_agg(row_to_json(v)), '[]'::jsonb) INTO vendors_json
    FROM (
        SELECT 
            COALESCE(supplier_name, 'Unknown Vendor') as vendor,
            SUM(total_amount) as total_spend
        FROM invoices
        WHERE client_id = client_id_param AND user_id = user_id_param
        GROUP BY COALESCE(supplier_name, 'Unknown Vendor')
        ORDER BY total_spend DESC
        LIMIT 5
    ) v;

    -- 4. Recon Health: Count by recon status
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO recon_json
    FROM (
        SELECT 
            COALESCE(recon_status, 'unreconciled') as status,
            COUNT(id) as count
        FROM invoices
        WHERE client_id = client_id_param AND user_id = user_id_param
        GROUP BY COALESCE(recon_status, 'unreconciled')
    ) r;

    -- Return composed JSONB
    RETURN jsonb_build_object(
        'trends', trends_json,
        'categories', categories_json,
        'vendors', vendors_json,
        'recon', recon_json
    );
END;
$$;
