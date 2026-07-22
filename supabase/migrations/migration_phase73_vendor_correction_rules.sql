-- Phase 73: Vendor correction / memory layer (keyed by org + vendor GSTIN)
-- Plain lookup table — not a vector DB. Deterministic exact rules + soft prompt hints.

CREATE TABLE IF NOT EXISTS public.vendor_correction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_gstin TEXT NOT NULL,
    field_name TEXT NOT NULL,
    rule_kind TEXT NOT NULL CHECK (rule_kind IN ('exact', 'hint')),
    -- exact: when extracted value matches from_value (or from_value is NULL), set to_value
    from_value TEXT,
    to_value TEXT,
    -- hint: free-text injected into extraction prompt for fuzzy fields
    hint_text TEXT,
    hit_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vendor_correction_rules_exact_needs_to
      CHECK (rule_kind <> 'exact' OR to_value IS NOT NULL),
    CONSTRAINT vendor_correction_rules_hint_needs_text
      CHECK (rule_kind <> 'hint' OR (hint_text IS NOT NULL AND length(trim(hint_text)) > 0))
);

-- One exact rule per (org, vendor, field, from_value); one hint per (org, vendor, field, hint fingerprint)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_rules_exact
    ON public.vendor_correction_rules (org_id, vendor_gstin, field_name, rule_kind, COALESCE(from_value, ''));

CREATE INDEX IF NOT EXISTS idx_vendor_rules_lookup
    ON public.vendor_correction_rules (org_id, vendor_gstin);

ALTER TABLE public.vendor_correction_rules ENABLE ROW LEVEL SECURITY;

-- Org members can read/write their own vendor memory
DROP POLICY IF EXISTS vendor_correction_rules_select ON public.vendor_correction_rules;
CREATE POLICY vendor_correction_rules_select
    ON public.vendor_correction_rules
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.org_id = vendor_correction_rules.org_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS vendor_correction_rules_insert ON public.vendor_correction_rules;
CREATE POLICY vendor_correction_rules_insert
    ON public.vendor_correction_rules
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.org_id = vendor_correction_rules.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin', 'accountant')
        )
    );

DROP POLICY IF EXISTS vendor_correction_rules_update ON public.vendor_correction_rules;
CREATE POLICY vendor_correction_rules_update
    ON public.vendor_correction_rules
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.org_id = vendor_correction_rules.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin', 'accountant')
        )
    );

DROP POLICY IF EXISTS vendor_correction_rules_delete ON public.vendor_correction_rules;
CREATE POLICY vendor_correction_rules_delete
    ON public.vendor_correction_rules
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.org_id = vendor_correction_rules.org_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

COMMENT ON TABLE public.vendor_correction_rules IS
  'Per-org vendor GSTIN correction memory: exact replacements for critical fields + soft prompt hints for fuzzy text.';
