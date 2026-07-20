-- Phase 56: Fix Client Insert RLS Policy + Ensure User Org Safety Net
-- Bug: Accountant-role users cannot create clients because the INSERT RLS policy
-- only allows owner/admin. Also, legacy users without an org pass org_id=NULL,
-- causing the RLS WITH CHECK to fail silently.

-- 1. Create a safety-net function: ensure_user_org()
-- If the current user has no organization, auto-create a personal org and add them as owner.
-- Returns the user's org_id (existing or newly created).
CREATE OR REPLACE FUNCTION public.ensure_user_org()
RETURNS UUID AS $$
DECLARE
    existing_org_id UUID;
    new_org_id UUID;
BEGIN
    -- Check if user already has an org
    SELECT org_id INTO existing_org_id FROM get_user_orgs() LIMIT 1;
    IF existing_org_id IS NOT NULL THEN
        RETURN existing_org_id;
    END IF;

    -- No org found — create a personal organization
    INSERT INTO public.organizations (name, owner_id, join_code, credits)
    VALUES (
        'My Firm',
        auth.uid(),
        UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)),
        100
    )
    RETURNING id INTO new_org_id;

    -- Add user as owner
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (new_org_id, auth.uid(), 'owner');

    -- Set active_org_id on profile
    UPDATE public.profiles SET active_org_id = new_org_id WHERE id = auth.uid();

    RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Broaden the clients INSERT RLS policy to allow any org member (any role)
-- Previously only owner/admin could insert. Now accountants can create clients too.
-- RLS SELECT policy already restricts visibility via has_client_access().
DROP POLICY IF EXISTS "Admins can insert clients" ON clients;
CREATE POLICY "Org members can insert clients" ON clients
FOR INSERT WITH CHECK (
    org_id IN (
        SELECT org_id FROM get_user_orgs()
    )
);