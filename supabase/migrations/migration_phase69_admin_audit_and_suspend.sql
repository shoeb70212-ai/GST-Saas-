-- Phase 69: Admin audit log, org suspend fields, credit adjust RPC
-- Apply after migration_phase68_ops_triage.sql

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin_user_id UUID NOT NULL,
    action TEXT NOT NULL,
    target_org_id UUID NULL,
    target_user_id UUID NULL,
    before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
    ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_org
    ON public.admin_audit_log (target_org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user
    ON public.admin_audit_log (target_user_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Service-role only (no authenticated policies)

COMMENT ON TABLE public.admin_audit_log IS
  'Super-admin mutation trail: credit adjust, suspend, impersonate, bulk test cleanup.';

-- Soft-archive flag for test firm cleanup
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS is_test_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Suspend metadata (prefer org as firm unit)
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS suspended_by UUID NULL,
    ADD COLUMN IF NOT EXISTS suspend_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS suspend_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_suspended_at
    ON public.organizations (suspended_at)
    WHERE suspended_at IS NOT NULL;

-- Atomic credit adjust with non-negative floor (unless allow_negative)
CREATE OR REPLACE FUNCTION public.admin_adjust_org_credits(
    org_id_param UUID,
    delta_param INTEGER,
    admin_id_param UUID,
    note_param TEXT DEFAULT NULL,
    allow_negative BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    before_credits INTEGER;
    after_credits INTEGER;
BEGIN
    IF delta_param IS NULL OR delta_param = 0 THEN
        RAISE EXCEPTION 'delta_param must be a non-zero integer';
    END IF;

    SELECT credits INTO before_credits
    FROM public.organizations
    WHERE id = org_id_param
    FOR UPDATE;

    IF before_credits IS NULL THEN
        RAISE EXCEPTION 'organization not found';
    END IF;

    after_credits := before_credits + delta_param;
    IF after_credits < 0 AND NOT COALESCE(allow_negative, FALSE) THEN
        after_credits := 0;
    END IF;

    UPDATE public.organizations
    SET credits = after_credits
    WHERE id = org_id_param;

    INSERT INTO public.admin_audit_log (
        admin_user_id, action, target_org_id, before_json, after_json, note
    ) VALUES (
        admin_id_param,
        'credit_adjust',
        org_id_param,
        jsonb_build_object('credits', before_credits),
        jsonb_build_object('credits', after_credits, 'delta', delta_param),
        note_param
    );

    RETURN after_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_org_credits(UUID, INTEGER, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_org_credits(UUID, INTEGER, UUID, TEXT, BOOLEAN) TO service_role;
