-- Phase 65: Multi-org wallet resolution
-- Prefer profiles.active_org_id, then organization_members (owner > admin > accountant,
-- earliest membership), then earliest owned organization. Avoids ambiguous
-- organizations.owner_id LIMIT 1 when a user belongs to multiple firms.

CREATE OR REPLACE FUNCTION public.resolve_user_org_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT active_org_id INTO v_org_id
    FROM profiles
    WHERE id = p_user_id;

    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id;
    END IF;

    SELECT om.org_id INTO v_org_id
    FROM organization_members om
    WHERE om.user_id = p_user_id
    ORDER BY
        CASE lower(coalesce(om.role, ''))
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'accountant' THEN 2
            ELSE 9
        END,
        om.created_at ASC NULLS LAST
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id;
    END IF;

    SELECT o.id INTO v_org_id
    FROM organizations o
    WHERE o.owner_id = p_user_id
    ORDER BY o.created_at ASC NULLS LAST
    LIMIT 1;

    RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_org_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_user_org_id(UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- decrement_credits — membership-aware org resolution (keeps phase60/63 auth)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrement_credits(
    user_id_param UUID,
    amount INT DEFAULT 1,
    task_type_param TEXT DEFAULT 'invoice_scan',
    file_name_param TEXT DEFAULT NULL,
    tokens_used_param INT DEFAULT 0,
    status_param TEXT DEFAULT 'success'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_credits INTEGER;
    user_active_org_id UUID;
    caller_role TEXT := coalesce(auth.role(), '');
    caller_uid UUID := auth.uid();
BEGIN
    IF caller_role IS DISTINCT FROM 'service_role'
       AND (caller_uid IS NULL OR caller_uid IS DISTINCT FROM user_id_param) THEN
        RAISE EXCEPTION 'Unauthorized credit operation'
            USING ERRCODE = '42501';
    END IF;

    user_active_org_id := public.resolve_user_org_id(user_id_param);

    IF user_active_org_id IS NULL THEN
        RETURN -1;
    END IF;

    IF amount > 0 THEN
        UPDATE organizations
        SET credits = credits - amount,
            updated_at = NOW()
        WHERE id = user_active_org_id AND credits >= amount
        RETURNING credits INTO current_credits;

        IF current_credits IS NULL THEN
            RETURN -1;
        END IF;
    ELSE
        SELECT credits INTO current_credits FROM organizations WHERE id = user_active_org_id;
    END IF;

    INSERT INTO credit_usage_logs (user_id, org_id, task_type, file_name, tokens_used, credits_deducted, status)
    VALUES (user_id_param, user_active_org_id, task_type_param, file_name_param, tokens_used_param, amount, status_param);

    RETURN COALESCE(current_credits, -1);
END;
$$;

-- ---------------------------------------------------------------------------
-- refund_credits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_credits(user_id_param UUID, amount INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    caller_role TEXT := coalesce(auth.role(), '');
    caller_uid UUID := auth.uid();
BEGIN
    IF amount IS NULL OR amount <= 0 THEN
        RETURN;
    END IF;

    IF caller_role IS DISTINCT FROM 'service_role'
       AND (caller_uid IS NULL OR caller_uid IS DISTINCT FROM user_id_param) THEN
        RAISE EXCEPTION 'Unauthorized credit refund'
            USING ERRCODE = '42501';
    END IF;

    v_org_id := public.resolve_user_org_id(user_id_param);

    IF v_org_id IS NOT NULL THEN
        UPDATE organizations
        SET credits = credits + amount,
            updated_at = NOW()
        WHERE id = v_org_id;

        INSERT INTO credit_usage_logs (user_id, org_id, task_type, file_name, tokens_used, credits_deducted, status)
        VALUES (user_id_param, v_org_id, 'credit_refund', NULL, 0, -amount, 'refunded');
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- upgrade_user_tier — credit packs land on resolved active org only
-- ---------------------------------------------------------------------------
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

    v_amount_rupees := ROUND(COALESCE(p_amount_paid, 0)::NUMERIC / 100, 2);

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
        RETURN;
    END IF;

    v_org_id := public.resolve_user_org_id(p_user_id);

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
