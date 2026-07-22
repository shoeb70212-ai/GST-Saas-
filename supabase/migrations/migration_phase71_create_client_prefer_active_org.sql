-- Phase 71: Prefer profiles.active_org_id when creating clients
-- Signup already creates an org + membership (handle_new_user).
-- create_client_secure previously used get_user_orgs() LIMIT 1, which can pick the
-- wrong firm for multi-org users. Prefer the user's active org when they are a member.

CREATE OR REPLACE FUNCTION public.create_client_secure(
    p_client_name TEXT,
    p_gstin TEXT DEFAULT NULL,
    p_pan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_active_org UUID;
    v_client clients%ROWTYPE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_client_name IS NULL OR btrim(p_client_name) = '' THEN
        RAISE EXCEPTION 'Client name is required';
    END IF;

    -- Prefer active org when the user is still a member of it
    SELECT active_org_id INTO v_active_org FROM profiles WHERE id = v_user_id;
    IF v_active_org IS NOT NULL THEN
        SELECT om.org_id INTO v_org_id
        FROM organization_members om
        WHERE om.user_id = v_user_id AND om.org_id = v_active_org
        LIMIT 1;
    END IF;

    -- Fallback: any membership
    IF v_org_id IS NULL THEN
        SELECT org_id INTO v_org_id FROM get_user_orgs() LIMIT 1;
    END IF;

    -- Legacy users with no org row
    IF v_org_id IS NULL THEN
        v_org_id := ensure_user_org();
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found for user';
    END IF;

    UPDATE profiles SET active_org_id = v_org_id WHERE id = v_user_id;

    INSERT INTO clients (user_id, org_id, client_name, gstin, pan)
    VALUES (
        v_user_id,
        v_org_id,
        btrim(p_client_name),
        NULLIF(btrim(p_gstin), ''),
        NULLIF(btrim(p_pan), '')
    )
    RETURNING * INTO v_client;

    RETURN to_jsonb(v_client);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_secure(TEXT, TEXT, TEXT) TO authenticated;
