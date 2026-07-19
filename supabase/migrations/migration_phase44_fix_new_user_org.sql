-- Phase 44: Fix New User Organization Creation
-- Ensures that new users get a default organization, otherwise they cannot save invoices due to org_id NOT NULL constraint.

-- 1. Update the trigger function to automatically create an organization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
BEGIN
    -- 1. Create Profile with 100 credits
    INSERT INTO public.profiles (id, credits)
    VALUES (new.id, 100);
    
    -- 2. Create Default Organization (Using 100 credits)
    INSERT INTO public.organizations (name, owner_id, join_code, credits)
    VALUES (
        COALESCE(new.raw_user_meta_data->>'company', 'My Firm'), 
        new.id, 
        UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)), 
        100
    )
    RETURNING id INTO new_org_id;
    
    -- 3. Assign User as Owner
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (new_org_id, new.id, 'owner');
    
    -- 4. Set Active Org in Profile
    UPDATE public.profiles SET active_org_id = new_org_id WHERE id = new.id;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Retroactively fix any existing users who are missing an organization
DO $$
DECLARE
    r RECORD;
    new_org_id UUID;
    existing_credits INT;
BEGIN
    -- Only target users who are NOT members of ANY organization
    FOR r IN SELECT id FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.organization_members)
    LOOP
        -- Get existing credits from profile (default to 100 if profile is missing)
        SELECT credits INTO existing_credits FROM public.profiles WHERE id = r.id;
        IF existing_credits IS NULL THEN
            existing_credits := 100;
            -- Create the missing profile
            INSERT INTO public.profiles (id, credits) VALUES (r.id, 100) ON CONFLICT (id) DO NOTHING;
        END IF;

        -- Create Organization carrying over the existing credits
        INSERT INTO public.organizations (name, owner_id, join_code, credits)
        VALUES ('My Firm', r.id, UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)), existing_credits)
        RETURNING id INTO new_org_id;
        
        -- Assign Owner
        INSERT INTO public.organization_members (org_id, user_id, role)
        VALUES (new_org_id, r.id, 'owner');
        
        -- Set active_org_id
        UPDATE public.profiles SET active_org_id = new_org_id WHERE id = r.id;
    END LOOP;
END;
$$;
