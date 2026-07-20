-- Fix set_default_org_id to respect explicitly provided org_id and improve fallback logic

CREATE OR REPLACE FUNCTION set_default_org_id()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. If the frontend explicitly provides an org_id, verify the user actually belongs to it
    IF NEW.org_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM organization_members WHERE org_id = NEW.org_id AND user_id = auth.uid()) THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 2. Otherwise, fallback to their active_org_id
    SELECT active_org_id INTO NEW.org_id FROM profiles WHERE id = auth.uid();
    
    -- 3. If active_org_id is still NULL, fallback to the first org they belong to
    IF NEW.org_id IS NULL THEN
        SELECT org_id INTO NEW.org_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
