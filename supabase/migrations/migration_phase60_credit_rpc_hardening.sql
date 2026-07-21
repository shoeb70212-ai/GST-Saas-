-- Phase 60: Credit RPC hardening + signup trigger fix
-- 1. Bind decrement_credits / refund_credits to auth.uid() OR service_role
-- 2. Fix handle_new_user after profiles.credits was dropped (phase 54)
-- 3. Narrow EXECUTE grants (keep authenticated for self-calls via user JWT)

-- ---------------------------------------------------------------------------
-- 1. decrement_credits — require caller is the user OR service_role
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
    -- Prevent cross-tenant credit theft / minting via PostgREST
    IF caller_role IS DISTINCT FROM 'service_role'
       AND (caller_uid IS NULL OR caller_uid IS DISTINCT FROM user_id_param) THEN
        RAISE EXCEPTION 'Unauthorized credit operation'
            USING ERRCODE = '42501';
    END IF;

    SELECT active_org_id INTO user_active_org_id FROM profiles WHERE id = user_id_param;

    IF user_active_org_id IS NULL THEN
        SELECT id INTO user_active_org_id FROM organizations WHERE owner_id = user_id_param LIMIT 1;
    END IF;

    IF user_active_org_id IS NULL THEN
        RETURN -1;
    END IF;

    IF amount > 0 THEN
        UPDATE organizations
        SET credits = credits - amount
        WHERE id = user_active_org_id AND credits >= amount
        RETURNING credits INTO current_credits;

        IF current_credits IS NULL THEN
            RETURN -1;
        END IF;
    ELSE
        -- amount <= 0: log-only (does NOT refund — use refund_credits)
        SELECT credits INTO current_credits FROM organizations WHERE id = user_active_org_id;
    END IF;

    INSERT INTO credit_usage_logs (user_id, org_id, task_type, file_name, tokens_used, credits_deducted, status)
    VALUES (user_id_param, user_active_org_id, task_type_param, file_name_param, tokens_used_param, amount, status_param);

    RETURN COALESCE(current_credits, -1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. refund_credits — same auth binding + usage log for wallet history
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

    SELECT COALESCE(
        (SELECT active_org_id FROM profiles WHERE id = user_id_param),
        (SELECT id FROM organizations WHERE owner_id = user_id_param LIMIT 1)
    ) INTO v_org_id;

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

REVOKE ALL ON FUNCTION public.decrement_credits(UUID, INT, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, INT, TEXT, TEXT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user — profiles.credits column no longer exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (name, owner_id, join_code, credits)
    VALUES (
        COALESCE(new.raw_user_meta_data->>'company', 'My Firm'),
        new.id,
        UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)),
        100
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (new_org_id, new.id, 'owner');

    UPDATE public.profiles SET active_org_id = new_org_id WHERE id = new.id;

    RETURN new;
END;
$$;
