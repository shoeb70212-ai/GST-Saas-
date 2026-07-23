-- =====================================================================================
-- Migration Phase 75: ITC-at-Risk eligibility tags on invoices
-- =====================================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS itc_eligibility TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_itc_eligibility_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_itc_eligibility_check
  CHECK (itc_eligibility IN (
    'eligible',
    'ineligible_17_5',
    'blocked_vendor',
    'missing_2b',
    'unknown'
  ));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS itc_risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_client_itc_eligibility
  ON invoices (client_id, itc_eligibility)
  WHERE itc_eligibility IS DISTINCT FROM 'unknown';

COMMENT ON COLUMN invoices.itc_eligibility IS
  'ITC claim risk bucket: eligible | ineligible_17_5 | blocked_vendor | missing_2b | unknown';
COMMENT ON COLUMN invoices.itc_risk_flags IS
  'Array of risk codes e.g. VENDOR_CANCELLED, MISSING_IN_2B, SECTION_17_5';
