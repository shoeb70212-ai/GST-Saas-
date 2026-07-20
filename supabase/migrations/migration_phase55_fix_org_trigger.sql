-- 1. Fix the trigger that was aggressively overwriting org_id with NULL
CREATE OR REPLACE FUNCTION set_default_org_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If the frontend provided a valid org_id, respect it!
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Fallback 1: Force overwrite based on authenticated user's active org
    SELECT active_org_id INTO NEW.org_id FROM profiles WHERE id = auth.uid();
    
    -- Fallback 2: The first organization the user owns
    IF NEW.org_id IS NULL THEN
        SELECT id INTO NEW.org_id FROM organizations WHERE owner_id = auth.uid() LIMIT 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure the RLS Policy allows insert if the user is owner/admin
-- Dropping and recreating to be absolutely sure it's correct
DROP POLICY IF EXISTS "Admins can insert clients" ON clients;
CREATE POLICY "Admins can insert clients" ON clients 
FOR INSERT WITH CHECK (
    org_id IN (
        SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')
    )
);
