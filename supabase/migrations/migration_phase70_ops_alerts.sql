-- Phase 70: Ops alert cooldown state for error-spike notifications
-- Apply after migration_phase69_admin_audit_and_suspend.sql

CREATE TABLE IF NOT EXISTS public.ops_alert_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_key TEXT NOT NULL UNIQUE,
    last_fired_at TIMESTAMPTZ NULL,
    last_count INTEGER NOT NULL DEFAULT 0,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ops_alert_state ENABLE ROW LEVEL SECURITY;
-- Service-role only

COMMENT ON TABLE public.ops_alert_state IS
  'Cooldown / last-fire state for platform ops spike alerts (e.g. error_spike_15m).';

INSERT INTO public.ops_alert_state (alert_key, last_count, meta)
VALUES ('error_spike_15m', 0, '{}'::jsonb)
ON CONFLICT (alert_key) DO NOTHING;
