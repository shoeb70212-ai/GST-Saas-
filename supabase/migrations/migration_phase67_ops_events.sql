-- Phase 67: Proactive extraction / scan ops events (platform admin visibility)
-- Non-PII operational log: failures, low-confidence, escalate events.
-- Writes are service-role only (backend ops_log.py). No tenant SELECT policies.

CREATE TABLE IF NOT EXISTS public.ops_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
    event_type TEXT NOT NULL,
    channel TEXT CHECK (channel IS NULL OR channel IN ('scan', 'batch', 'public', 'whatsapp')),
    org_id UUID,
    user_id UUID,
    client_id UUID,
    file_name_sanitized TEXT,
    mime_type TEXT,
    extraction_state TEXT,
    confidence_score NUMERIC,
    model_used TEXT,
    tokens_used INTEGER,
    latency_ms INTEGER,
    message TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_events_created_at
    ON public.ops_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_events_severity_created
    ON public.ops_events (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_events_channel_created
    ON public.ops_events (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_events_event_type_created
    ON public.ops_events (event_type, created_at DESC);

ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated roles: only service role (bypasses RLS) reads/writes.
-- Super-admin UI goes through FastAPI /api/admin/ops-events with service key.

COMMENT ON TABLE public.ops_events IS
  'Platform ops log for scan/extraction failures and quality signals. No full invoices or financial payloads.';
