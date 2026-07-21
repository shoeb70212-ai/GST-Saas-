-- Phase 64: Restore upgrade_user_tier with durable transactions ledger
-- Fixes audit C10 / §5 item 6:
--   1. Insert into public.transactions on successful credit packs
--   2. Credit a single org (active_org → owned org) — no multi-org double-credit
--   3. Idempotent on payment_id (unique) so verify retries do not re-credit
-- Note: Live DB was missing upgrade_user_tier entirely; fulfill_payment_order
-- calls this RPC. Do not update profiles.tier (column not present on prod).

-- Optional ledger column used by Wallet history / older monetization schema
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS plan_purchased TEXT;

CREATE OR REPLACE FUNCTION public.upgrade_user_tier(
    p_user_id UUID,
    p_plan_type TEXT,
    p_credits INTEGER,
    p_amount_paid INTEGER,
    p_payment_id TEXT,
    p_order_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_txn_id UUID;
    v_amount_rupees NUMERIC(10, 2);
BEGIN
    IF p_user_id IS NULL OR p_payment_id IS NULL OR p_payment_id = '' THEN
        RAISE EXCEPTION 'upgrade_user_tier requires user_id and payment_id';
    END IF;

    IF p_credits IS NULL OR p_credits <= 0 THEN
        RAISE EXCEPTION 'upgrade_user_tier requires positive credits';
    END IF;

    -- Razorpay / payment_orders store amount in paise; Wallet shows INR
    v_amount_rupees := ROUND(COALESCE(p_amount_paid, 0)::NUMERIC / 100, 2);

    -- Idempotency: unique payment_id — skip credit if ledger row already exists
    INSERT INTO public.transactions (
        user_id,
        payment_id,
        order_id,
        amount_paid,
        credits_added,
        plan_purchased,
        status
    )
    VALUES (
        p_user_id,
        p_payment_id,
        p_order_id,
        v_amount_rupees,
        p_credits,
        p_plan_type,
        'success'
    )
    ON CONFLICT (payment_id) DO NOTHING
    RETURNING id INTO v_txn_id;

    IF v_txn_id IS NULL THEN
        -- Already fulfilled for this payment_id
        RETURN;
    END IF;

    -- Single-org target (same pattern as refund_credits)
    SELECT COALESCE(
        (SELECT active_org_id FROM profiles WHERE id = p_user_id),
        (SELECT id FROM organizations WHERE owner_id = p_user_id LIMIT 1)
    ) INTO v_org_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found for user %', p_user_id;
    END IF;

    UPDATE organizations
    SET credits = credits + p_credits,
        updated_at = NOW()
    WHERE id = v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_user_tier(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upgrade_user_tier(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT)
    TO service_role;

-- Keep fulfill_payment_order callable; ensure search_path is locked down
CREATE OR REPLACE FUNCTION public.fulfill_payment_order(
    p_order_id TEXT,
    p_payment_id TEXT,
    p_amount_paid INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM payment_orders WHERE order_id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order.status = 'fulfilled' THEN
        RETURN json_build_object('success', true, 'message', 'Already fulfilled', 'credits_granted', 0);
    END IF;

    IF v_order.expected_amount != p_amount_paid THEN
        UPDATE payment_orders SET status = 'failed' WHERE order_id = p_order_id;
        RETURN json_build_object('success', false, 'error', 'Amount mismatch');
    END IF;

    PERFORM upgrade_user_tier(
        v_order.user_id,
        v_order.plan_type,
        v_order.expected_credits,
        p_amount_paid,
        p_payment_id,
        p_order_id
    );

    UPDATE payment_orders
    SET status = 'fulfilled', payment_id = p_payment_id, fulfilled_at = NOW()
    WHERE order_id = p_order_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Credits granted successfully',
        'credits_granted', v_order.expected_credits
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_payment_order(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_payment_order(TEXT, TEXT, INTEGER)
    TO authenticated, service_role;
