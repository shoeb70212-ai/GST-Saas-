-- Phase 54: Bug Fixes (Database Schema & Functions)

-- 1. Remove orphaned credits column from profiles to prevent double-credit bug at signup
ALTER TABLE profiles DROP COLUMN IF EXISTS credits;

-- 2. Rewrite get_dashboard_metrics RPC to use has_client_access()
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
    IF NOT has_client_access(client_id_param) THEN
        RETURN;
    END IF;
    
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
END;
$$;

-- 3. Rewrite Vendor and Dashboard RLS policies to use has_client_access()
DROP POLICY IF EXISTS "Users can view their client's vendors" ON vendors;
CREATE POLICY "Users can view their client's vendors"
ON vendors FOR SELECT
USING (has_client_access(vendors.client_id));

DROP POLICY IF EXISTS "Users can manage their client's vendors" ON vendors;
CREATE POLICY "Users can manage their client's vendors"
ON vendors FOR ALL
USING (has_client_access(vendors.client_id));

DROP POLICY IF EXISTS "Users can view their client stats" ON client_dashboard_stats;
CREATE POLICY "Users can view their client stats"
ON client_dashboard_stats FOR SELECT
USING (has_client_access(client_dashboard_stats.client_id));

-- 4. Create refund_credits RPC for the new AI wallet flow
CREATE OR REPLACE FUNCTION refund_credits(user_id_param UUID, amount INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Find the active organization for this user, or fallback to the org they own
    SELECT COALESCE(
        (SELECT active_org_id FROM profiles WHERE id = user_id_param),
        (SELECT id FROM organizations WHERE owner_id = user_id_param LIMIT 1)
    ) INTO v_org_id;

    IF v_org_id IS NOT NULL THEN
        UPDATE organizations
        SET credits = credits + amount,
            updated_at = NOW()
        WHERE id = v_org_id;
    END IF;
END;
$$;

-- 5. Fix ProGate lockouts (Gap 1)
CREATE OR REPLACE FUNCTION upgrade_user_tier(
    p_user_id UUID, p_plan_type TEXT, p_credits INTEGER,
    p_amount_paid INTEGER, p_payment_id TEXT, p_order_id TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE profiles SET tier = p_plan_type WHERE id = p_user_id;
    UPDATE organizations SET credits = credits + p_credits
    WHERE owner_id = p_user_id OR id = (SELECT active_org_id FROM profiles WHERE id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Exclude pending invoices from rate limiter (L11 fix)
CREATE OR REPLACE FUNCTION enforce_invoice_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_recent_count INT;
    v_limit INT := 100; -- Max 100 invoices
    v_window_minutes INT := 10; -- per 10 minutes
BEGIN
    -- Batch pre-inserts bypass rate limit
    IF NEW.processing_status = 'pending' THEN
        RETURN NEW;
    END IF;

    -- Only enforce for standard users
    IF auth.uid() IS NOT NULL THEN
        SELECT COUNT(id) INTO v_recent_count
        FROM invoices
        WHERE user_id = NEW.user_id 
        AND created_at > NOW() - (v_window_minutes || ' minutes')::INTERVAL;
        
        IF v_recent_count >= v_limit THEN
            RAISE EXCEPTION 'Rate limit exceeded: You can only upload % invoices per % minutes. Please try again later.', v_limit, v_window_minutes
                USING ERRCODE = '42900';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
