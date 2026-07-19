-- Migration Phase 11: Core Database Optimizations & Anomaly Detection

-- 1. Add retry_count to invoices table to track failed scans
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- 2. Add composite index for faster dashboard filtering (client + date)
CREATE INDEX IF NOT EXISTS idx_invoices_client_date ON invoices(client_id, invoice_date);

-- 3. Duplicate Invoice Blocker
-- We want to prevent the exact same invoice from being scanned twice for the same client.
-- NULL values in invoice_number or supplier_gstin bypass the UNIQUE constraint in Postgres,
-- which is acceptable because if the AI fails to extract them, they are manual review items anyway.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS unique_client_supplier_invoice;
ALTER TABLE invoices ADD CONSTRAINT unique_client_supplier_invoice UNIQUE NULLS NOT DISTINCT (client_id, supplier_gstin, invoice_number);

-- 4. Anomaly Detection Function (Z-Score)
-- Detects invoices that are unusually large compared to the historical average for that supplier.
CREATE OR REPLACE FUNCTION get_invoice_anomalies(client_id_param UUID, threshold_z_score DECIMAL DEFAULT 2.5)
RETURNS TABLE (
    invoice_id UUID,
    supplier_name TEXT,
    supplier_gstin TEXT,
    invoice_date DATE,
    total_amount DECIMAL,
    avg_amount DECIMAL,
    stddev_amount DECIMAL,
    z_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH supplier_stats AS (
        SELECT 
            i.supplier_gstin,
            AVG(i.total_amount) AS avg_amt,
            STDDEV_SAMP(i.total_amount) AS stddev_amt,
            COUNT(*) as invoice_count
        FROM invoices i
        WHERE i.client_id = client_id_param 
          AND i.supplier_gstin IS NOT NULL
          AND i.total_amount IS NOT NULL
        GROUP BY i.supplier_gstin
        HAVING COUNT(*) >= 3 -- Need at least 3 invoices to have a meaningful stddev
    )
    SELECT 
        inv.id AS invoice_id,
        inv.supplier_name,
        inv.supplier_gstin,
        inv.invoice_date,
        inv.total_amount,
        ROUND(stat.avg_amt, 2) AS avg_amount,
        ROUND(COALESCE(stat.stddev_amt, 0), 2) AS stddev_amount,
        ROUND(
            CASE 
                WHEN COALESCE(stat.stddev_amt, 0) = 0 THEN 0 
                ELSE (inv.total_amount - stat.avg_amt) / stat.stddev_amt 
            END, 
        2) AS z_score
    FROM invoices inv
    JOIN supplier_stats stat ON inv.supplier_gstin = stat.supplier_gstin
    WHERE inv.client_id = client_id_param
      AND inv.total_amount IS NOT NULL
      AND (
          (COALESCE(stat.stddev_amt, 0) > 0 AND (inv.total_amount - stat.avg_amt) / stat.stddev_amt >= threshold_z_score)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
