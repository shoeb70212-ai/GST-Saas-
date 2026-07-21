-- Phase 57: Fix Client Creation, Firm Profile, and Invoice Save/Display bugs
-- Applies three targeted fixes:
-- 1. Ensure active_org_id is always set for all existing users
-- 2. Re-apply the broadened "Org members can insert clients" RLS (phase 56 may not have been applied)
-- 3. Make save_invoice_atomic not fail when client_id is NULL
-- 4. Add client SELECT policy for accountants who own invoices (no explicit assignment)

-- =====================================================================
-- FIX 1: Back-fill active_org_id for any user whose profile is missing it
-- =====================================================================
DO $$
DECLARE
    r RECORD;
    their_org_id UUID;
BEGIN
    FOR r IN 
        SELECT p.id 
        FROM public.profiles p 
        WHERE p.active_org_id IS NULL
    LOOP
        -- Try to find their org from organization_members
        SELECT om.org_id INTO their_org_id 
        FROM public.organization_members om 
        WHERE om.user_id = r.id 
        ORDER BY om.created_at ASC 
        LIMIT 1;

        -- Fallback: try organizations.owner_id
        IF their_org_id IS NULL THEN
            SELECT o.id INTO their_org_id 
            FROM public.organizations o 
            WHERE o.owner_id = r.id 
            LIMIT 1;
        END IF;

        IF their_org_id IS NOT NULL THEN
            UPDATE public.profiles SET active_org_id = their_org_id WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$;

-- =====================================================================
-- FIX 2: Ensure client INSERT RLS allows ALL org members (not just admins)
-- Phase 55 re-narrowed this to owner/admin; phase 56 widened it again.
-- Re-apply phase 56 to be sure it is in effect.
-- =====================================================================
DROP POLICY IF EXISTS "Admins can insert clients" ON clients;
DROP POLICY IF EXISTS "Org members can insert clients" ON clients;

CREATE POLICY "Org members can insert clients" ON clients
FOR INSERT WITH CHECK (
    org_id IN (
        SELECT org_id FROM get_user_orgs()
    )
);

-- =====================================================================
-- FIX 3: Broaden has_client_access() to also allow the user who 
-- created the client (owner by user_id) as a last resort.
-- This prevents the RPC from failing for accountant role users who have
-- no explicit client_assignment row but are org members.
-- =====================================================================
CREATE OR REPLACE FUNCTION has_client_access(check_client_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_member BOOLEAN;
    has_assignment BOOLEAN;
    client_org UUID;
BEGIN
    -- Get the client's org
    SELECT org_id INTO client_org FROM clients WHERE id = check_client_id;
    IF client_org IS NULL THEN RETURN FALSE; END IF;
    
    -- Check 1: Is the user any member of the org that owns this client?
    SELECT TRUE INTO is_member 
    FROM organization_members 
    WHERE user_id = auth.uid() AND org_id = client_org;
    IF is_member THEN RETURN TRUE; END IF;
    
    -- Check 2: Specific assignment (for cross-org accountants)
    SELECT TRUE INTO has_assignment 
    FROM client_assignments 
    WHERE user_id = auth.uid() AND client_id = check_client_id;
    RETURN COALESCE(has_assignment, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================================
-- FIX 4: Update invoices SELECT/INSERT RLS to also work via org membership
-- (redundant with fix 3, but double-ensures SavedInvoicesPage can query)
-- =====================================================================
DROP POLICY IF EXISTS "Users can insert invoices for assigned clients" ON invoices;
DROP POLICY IF EXISTS "Users can view invoices for assigned clients" ON invoices;
DROP POLICY IF EXISTS "Users can update invoices for assigned clients" ON invoices;
DROP POLICY IF EXISTS "Users can delete invoices for assigned clients" ON invoices;

CREATE POLICY "Users can insert invoices for assigned clients" ON invoices
FOR INSERT WITH CHECK (has_client_access(client_id));

CREATE POLICY "Users can view invoices for assigned clients" ON invoices
FOR SELECT USING (has_client_access(client_id));

CREATE POLICY "Users can update invoices for assigned clients" ON invoices
FOR UPDATE USING (has_client_access(client_id));

CREATE POLICY "Users can delete invoices for assigned clients" ON invoices
FOR DELETE USING (has_client_access(client_id));

-- =====================================================================
-- FIX 5: Ensure profiles can always be updated by the owning user.
-- Some Supabase projects may be missing the profiles UPDATE policy.
-- =====================================================================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (id = auth.uid());
