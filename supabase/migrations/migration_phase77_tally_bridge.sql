-- =====================================================================================
-- Migration Phase 77: Tally Bridge devices + export jobs
-- =====================================================================================

CREATE TABLE IF NOT EXISTS bridge_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Bridge',
  device_secret_hash TEXT NOT NULL,
  client_id_allowlist UUID[] NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_devices_user_active
  ON bridge_devices (org_id, user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tally_export_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'invoices'
    CHECK (source IN ('invoices', 'converter', 'document')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'pushed', 'failed', 'cancelled')),
  xml TEXT NOT NULL,
  payload_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  claimed_by_device_id UUID REFERENCES bridge_devices(id) ON DELETE SET NULL,
  tally_response TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT tally_export_jobs_client_fingerprint_unique
    UNIQUE (client_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_tally_jobs_status_created
  ON tally_export_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_tally_jobs_client_status
  ON tally_export_jobs (client_id, status);

-- Claim next queued job for a device (SKIP LOCKED)
CREATE OR REPLACE FUNCTION claim_tally_export_job(
  device_id_param UUID,
  org_id_param UUID,
  allowlist UUID[] DEFAULT NULL
)
RETURNS SETOF tally_export_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_row tally_export_jobs;
BEGIN
  SELECT * INTO job_row
  FROM tally_export_jobs j
  WHERE j.status = 'queued'
    AND j.org_id = org_id_param
    AND (
      allowlist IS NULL
      OR cardinality(allowlist) = 0
      OR j.client_id = ANY (allowlist)
    )
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE tally_export_jobs
  SET status = 'claimed',
      claimed_by_device_id = device_id_param,
      updated_at = NOW()
  WHERE id = job_row.id
  RETURNING * INTO job_row;

  RETURN NEXT job_row;
END;
$$;

ALTER TABLE bridge_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own bridge devices" ON bridge_devices;
CREATE POLICY "Users manage own bridge devices"
  ON bridge_devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view org bridge devices" ON bridge_devices;
-- Org admins can SELECT/UPDATE revoke via RPC or service; keep owner-centric for MVP

DROP POLICY IF EXISTS "Users access tally export jobs" ON tally_export_jobs;
CREATE POLICY "Users access tally export jobs"
  ON tally_export_jobs FOR ALL
  USING (has_client_access(client_id))
  WITH CHECK (has_client_access(client_id));

-- Support session read-only triggers
DO $$
BEGIN
  IF to_regclass('public.enforce_support_session_read_only') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_support_ro_bridge_devices ON public.bridge_devices;
    CREATE TRIGGER trg_support_ro_bridge_devices
      BEFORE INSERT OR UPDATE OR DELETE ON public.bridge_devices
      FOR EACH ROW EXECUTE PROCEDURE public.enforce_support_session_read_only();

    DROP TRIGGER IF EXISTS trg_support_ro_tally_export_jobs ON public.tally_export_jobs;
    CREATE TRIGGER trg_support_ro_tally_export_jobs
      BEFORE INSERT OR UPDATE OR DELETE ON public.tally_export_jobs
      FOR EACH ROW EXECUTE PROCEDURE public.enforce_support_session_read_only();
  END IF;
END $$;

COMMENT ON TABLE bridge_devices IS 'KhataLens Tally Bridge device registrations (local XML pusher)';
COMMENT ON TABLE tally_export_jobs IS 'Queued Tally XML payloads for bridge devices to push to localhost:9000';
