-- Phase 63: bump organizations.updated_at on credit debit/refund
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

    SELECT active_org_id INTO user_active_org_id FROM profiles WHERE id = user_id_param;

    IF user_active_org_id IS NULL THEN
        SELECT id INTO user_active_org_id FROM organizations WHERE owner_id = user_id_param LIMIT 1;
    END IF;

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
