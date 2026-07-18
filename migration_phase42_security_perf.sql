-- =====================================================
-- Migration Phase 42: Security & Performance Optimizations
-- =====================================================

-- 1. Create payment_orders table for secure payment verification
CREATE TABLE IF NOT EXISTS payment_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    expected_credits INTEGER NOT NULL,
    expected_amount INTEGER NOT NULL,  -- Amount in paise
    plan_type TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, fulfilled, failed
    payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fulfilled_at TIMESTAMPTZ
);

-- Enable RLS on payment_orders
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own orders
DROP POLICY IF EXISTS "Users can view own payment_orders" ON payment_orders;
CREATE POLICY "Users can view own payment_orders"
    ON payment_orders FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own orders
DROP POLICY IF EXISTS "Users can insert own payment_orders" ON payment_orders;
CREATE POLICY "Users can insert own payment_orders"
    ON payment_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Note: Updates (for fulfillment) are done via service role key (backend only)

-- 2. Add is_super_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 3. Performance Indexes

-- Index for invoice duplicate detection
CREATE INDEX IF NOT EXISTS idx_invoices_user_gstin_invnum
    ON invoices(user_id, supplier_gstin, invoice_number);

-- Index for bank statement list queries
CREATE INDEX IF NOT EXISTS idx_bank_statements_client_created
    ON bank_statements(client_id, created_at DESC);

-- Index for credit usage logs
CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_org_created
    ON credit_usage_logs(org_id, created_at DESC);

-- Index for payment_orders lookups
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id
    ON payment_orders(order_id);

-- Index for payment_orders user lookup
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id
    ON payment_orders(user_id);

-- 4. Materialized view for tenant usage (replaces loading all invoices into memory)
CREATE MATERIALIZED VIEW IF NOT EXISTS tenant_usage AS
    SELECT 
        user_id,
        COUNT(*) as invoice_count,
        MAX(created_at) as last_invoice_at
    FROM invoices
    GROUP BY user_id;

-- Unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_usage_user_id
    ON tenant_usage(user_id);

-- 5. RPC function to fulfill a payment order (idempotent)
CREATE OR REPLACE FUNCTION fulfill_payment_order(
    p_order_id TEXT,
    p_payment_id TEXT,
    p_amount_paid INTEGER
) RETURNS JSON AS $$
DECLARE
    v_order RECORD;
    v_result JSON;
BEGIN
    -- Lock the order row for update (prevents race condition / double fulfillment)
    SELECT * INTO v_order FROM payment_orders WHERE order_id = p_order_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;
    
    -- Idempotency: if already fulfilled, return success without re-granting
    IF v_order.status = 'fulfilled' THEN
        RETURN json_build_object('success', true, 'message', 'Already fulfilled', 'credits_granted', 0);
    END IF;
    
    -- Verify amount matches
    IF v_order.expected_amount != p_amount_paid THEN
        UPDATE payment_orders SET status = 'failed' WHERE order_id = p_order_id;
        RETURN json_build_object('success', false, 'error', 'Amount mismatch');
    END IF;
    
    -- Grant credits via upgrade_user_tier
    PERFORM upgrade_user_tier(
        v_order.user_id,
        v_order.plan_type,
        v_order.expected_credits,
        p_amount_paid,
        p_payment_id,
        p_order_id
    );
    
    -- Mark order as fulfilled
    UPDATE payment_orders 
    SET status = 'fulfilled', payment_id = p_payment_id, fulfilled_at = NOW()
    WHERE order_id = p_order_id;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Credits granted successfully',
        'credits_granted', v_order.expected_credits
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant execute on fulfill_payment_order to authenticated users (backend uses service role)
GRANT EXECUTE ON FUNCTION fulfill_payment_order TO authenticated;

-- 7. Refresh tenant_usage materialized view periodically
