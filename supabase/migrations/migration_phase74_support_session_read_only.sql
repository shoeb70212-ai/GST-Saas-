-- Phase 74: Enforce read-only support (impersonation) sessions at the DB layer.
-- app_metadata.is_support_session is stamped by admin impersonate before magic link.
-- Service role (backend workers / admin) bypasses; authenticated JWT writes are blocked.

CREATE OR REPLACE FUNCTION public.is_active_support_session()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(auth.jwt() -> 'app_metadata' ->> 'is_support_session', '') NOT IN ('true', '1', 'yes')
      THEN false
    WHEN nullif(auth.jwt() -> 'app_metadata' ->> 'support_session_expires_at', '') IS NULL
      THEN true
    WHEN (auth.jwt() -> 'app_metadata' ->> 'support_session_expires_at') ~ '^[0-9]+$'
      AND extract(epoch FROM now())::bigint
          > (auth.jwt() -> 'app_metadata' ->> 'support_session_expires_at')::bigint
      THEN false
    ELSE true
  END;
$$;

COMMENT ON FUNCTION public.is_active_support_session() IS
  'True when JWT app_metadata marks an unexpired support/impersonation session.';

CREATE OR REPLACE FUNCTION public.enforce_support_session_read_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend workers and platform admin use service_role.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF public.is_active_support_session() THEN
    RAISE EXCEPTION 'Support sessions are read-only'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_support_session_read_only() IS
  'BEFORE trigger: block INSERT/UPDATE/DELETE for active support sessions.';

-- Attach to primary tenant-writable tables (idempotent drop/create).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'invoices',
    'invoice_line_items',
    'clients',
    'profiles',
    'client_assignments',
    'organizations',
    'organization_members',
    'bank_statements',
    'bank_transactions',
    'sales_records',
    'gstr2b_records',
    'reconciliation_matches',
    'payment_orders',
    'vendor_correction_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_support_ro_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_support_ro_%I
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW
         EXECUTE PROCEDURE public.enforce_support_session_read_only()',
      t, t
    );
  END LOOP;
END $$;
