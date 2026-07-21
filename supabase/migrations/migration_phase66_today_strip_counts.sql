-- Phase 66: Today-strip KPI counts (unmatched GSTR-2B + bank)
-- Lightweight SECURITY DEFINER RPC — count-only, no full table loads.

CREATE OR REPLACE FUNCTION get_today_strip_counts(client_id_param UUID)
RETURNS TABLE (
    unmatched_2b_count BIGINT,
    unmatched_bank_count BIGINT,
    has_2b_data BOOLEAN,
    has_bank_data BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT has_client_access(client_id_param) THEN
        RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, FALSE, FALSE;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        (
            SELECT COUNT(*)::BIGINT
            FROM invoices i
            WHERE i.client_id = client_id_param
              AND i.recon_status IN ('missing_in_2b', 'mismatch')
        ) AS unmatched_2b_count,
        (
            SELECT COUNT(*)::BIGINT
            FROM bank_transactions bt
            INNER JOIN bank_statements bs ON bs.id = bt.statement_id
            WHERE bs.client_id = client_id_param
              AND COALESCE(bt.is_fully_allocated, FALSE) = FALSE
              AND COALESCE(bt.withdrawal, 0) > 0
        ) AS unmatched_bank_count,
        EXISTS (
            SELECT 1 FROM gstr2b_records g WHERE g.client_id = client_id_param LIMIT 1
        ) AS has_2b_data,
        EXISTS (
            SELECT 1 FROM bank_statements s WHERE s.client_id = client_id_param LIMIT 1
        ) AS has_bank_data;
END;
$$;

REVOKE ALL ON FUNCTION get_today_strip_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_today_strip_counts(UUID) TO authenticated;

-- Supporting indexes (idempotent) for count paths
CREATE INDEX IF NOT EXISTS idx_invoices_client_recon_status
    ON invoices (client_id, recon_status);

CREATE INDEX IF NOT EXISTS idx_bank_txns_stmt_alloc_withdrawal
    ON bank_transactions (statement_id, is_fully_allocated)
    WHERE COALESCE(withdrawal, 0) > 0;
