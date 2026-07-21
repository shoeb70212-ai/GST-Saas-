-- Phase 68: Ops event triage / resolution columns for platform admin
-- Apply after migration_phase67_ops_events.sql

ALTER TABLE public.ops_events
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS resolved_by UUID NULL,
    ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_events_severity_resolved_created
    ON public.ops_events (severity, resolved_at, created_at DESC);

COMMENT ON COLUMN public.ops_events.resolved_at IS
  'When a super-admin marked this ops event resolved; NULL = open';
COMMENT ON COLUMN public.ops_events.resolved_by IS
  'profiles.id of the super-admin who resolved the event';
COMMENT ON COLUMN public.ops_events.resolution_note IS
  'Optional operator note (API caps at 1000 chars)';
