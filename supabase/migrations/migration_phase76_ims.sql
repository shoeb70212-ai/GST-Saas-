-- =====================================================================================
-- Migration Phase 76: IMS records + invoices.ims_status
-- =====================================================================================

CREATE TABLE IF NOT EXISTS ims_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  supplier_gstin TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  invoice_date TEXT,
  taxable_value NUMERIC(15, 2) DEFAULT 0,
  igst NUMERIC(15, 2) DEFAULT 0,
  cgst NUMERIC(15, 2) DEFAULT 0,
  sgst NUMERIC(15, 2) DEFAULT 0,
  ims_action TEXT NOT NULL DEFAULT 'pending'
    CHECK (ims_action IN ('pending', 'accepted', 'rejected')),
  action_reason TEXT,
  deemed_accept_by DATE,
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ims_records_client_period_inv_unique
    UNIQUE (client_id, period, supplier_gstin, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_ims_client_period_action
  ON ims_records (client_id, period, ims_action);

CREATE INDEX IF NOT EXISTS idx_ims_deemed_accept_by
  ON ims_records (client_id, deemed_accept_by)
  WHERE ims_action = 'pending';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ims_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_ims_status_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_ims_status_check
  CHECK (ims_status IN (
    'pending',
    'accepted',
    'rejected',
    'not_in_ims',
    'unknown'
  ));

CREATE INDEX IF NOT EXISTS idx_invoices_client_ims_status
  ON invoices (client_id, ims_status)
  WHERE ims_status IS DISTINCT FROM 'unknown';

ALTER TABLE ims_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view assigned ims records" ON ims_records;
DROP POLICY IF EXISTS "Users insert assigned ims records" ON ims_records;
DROP POLICY IF EXISTS "Users update assigned ims records" ON ims_records;
DROP POLICY IF EXISTS "Users delete assigned ims records" ON ims_records;

CREATE POLICY "Users view assigned ims records"
  ON ims_records FOR SELECT USING (has_client_access(client_id));
CREATE POLICY "Users insert assigned ims records"
  ON ims_records FOR INSERT WITH CHECK (has_client_access(client_id));
CREATE POLICY "Users update assigned ims records"
  ON ims_records FOR UPDATE USING (has_client_access(client_id));
CREATE POLICY "Users delete assigned ims records"
  ON ims_records FOR DELETE USING (has_client_access(client_id));

COMMENT ON TABLE ims_records IS
  'IMS invoice actions from portal JSON upload (Accept/Reject/Pending); GSP sync later';
COMMENT ON COLUMN invoices.ims_status IS
  'Sync from ims_records: pending|accepted|rejected|not_in_ims|unknown';

-- Support impersonation: block writes during support sessions
DO $$
BEGIN
  IF to_regclass('public.enforce_support_session_read_only') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_support_ro_ims_records ON public.ims_records;
    CREATE TRIGGER trg_support_ro_ims_records
      BEFORE INSERT OR UPDATE OR DELETE ON public.ims_records
      FOR EACH ROW
      EXECUTE PROCEDURE public.enforce_support_session_read_only();
  END IF;
END $$;
