-- Migration Phase 38: Enterprise RBAC & Audit Logging
-- Adds support for Multi-User CA Firms, Role-Based Access Control, and Immutable Audit Trails.

-- =====================================================================================
-- 1. Create Core Tables
-- =====================================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    join_code TEXT UNIQUE,
    credits INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('owner', 'admin', 'accountant')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS client_assignments (
    client_id UUID, -- Will reference clients(id) after org_id is added
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add active_org_id to profiles for context switching
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- =====================================================================================
-- 2. Modify Existing Tables (Inject org_id)
-- =====================================================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE gstr2b_records ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_pending_files ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add foreign key constraint to client_assignments now that org_id exists
ALTER TABLE client_assignments DROP CONSTRAINT IF EXISTS fk_client_assignments_client;
ALTER TABLE client_assignments ADD CONSTRAINT fk_client_assignments_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- =====================================================================================
-- 3. Data Backfill (Zero Data Loss Migration)
-- =====================================================================================
-- This script turns every existing single user into a Firm Owner, moving their credits.

DO $$
DECLARE
    r RECORD;
    new_org_id UUID;
    user_credits INTEGER;
    company TEXT;
BEGIN
    FOR r IN SELECT id FROM auth.users LOOP
        -- Check if org already exists for this user (prevent duplicate runs)
        IF NOT EXISTS (SELECT 1 FROM organizations WHERE owner_id = r.id) THEN
            
            -- Get their current credits and company name from profiles
            SELECT credits, company_name INTO user_credits, company FROM profiles WHERE id = r.id;
            
            -- Fallbacks if profile missing
            IF user_credits IS NULL THEN user_credits := 100; END IF;
            IF company IS NULL OR company = '' THEN company := 'My Firm'; END IF;
            
            -- 1. Create Organization
            INSERT INTO organizations (name, owner_id, join_code, credits)
            VALUES (company, r.id, UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)), user_credits)
            RETURNING id INTO new_org_id;
            
            -- 2. Add as Owner to members
            INSERT INTO organization_members (org_id, user_id, role)
            VALUES (new_org_id, r.id, 'owner');
            
            -- 3. Set active_org_id
            UPDATE profiles SET active_org_id = new_org_id WHERE id = r.id;
            
            -- 4. Move historical data to this org
            UPDATE clients SET org_id = new_org_id WHERE user_id = r.id AND org_id IS NULL;
            UPDATE invoices SET org_id = new_org_id WHERE user_id = r.id AND org_id IS NULL;
            UPDATE gstr2b_records SET org_id = new_org_id WHERE user_id = r.id AND org_id IS NULL;
            UPDATE whatsapp_pending_files SET org_id = new_org_id WHERE user_id = r.id AND org_id IS NULL;
        END IF;
    END LOOP;
END $$;

-- Enforce NOT NULL after backfill
ALTER TABLE clients ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;
-- (Skipping NOT NULL for gstr2b_records & whatsapp_pending just in case of empty states)

-- =====================================================================================
-- 3b. Auto-fill org_id Triggers (Backend Decoupling)
-- =====================================================================================
-- Ensures that if the backend (FastAPI/React) forgets to send `org_id` on insert, 
-- Postgres will magically fetch the user's active firm and assign the data correctly.

CREATE OR REPLACE FUNCTION set_default_org_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.org_id IS NULL THEN
        SELECT active_org_id INTO NEW.org_id FROM profiles WHERE id = NEW.user_id;
        
        IF NEW.org_id IS NULL THEN
            SELECT id INTO NEW.org_id FROM organizations WHERE owner_id = NEW.user_id LIMIT 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_set_client_org BEFORE INSERT ON clients FOR EACH ROW EXECUTE PROCEDURE set_default_org_id();
CREATE TRIGGER trigger_set_invoice_org BEFORE INSERT ON invoices FOR EACH ROW EXECUTE PROCEDURE set_default_org_id();
CREATE TRIGGER trigger_set_gstr2b_org BEFORE INSERT ON gstr2b_records FOR EACH ROW EXECUTE PROCEDURE set_default_org_id();
CREATE TRIGGER trigger_set_whatsapp_org BEFORE INSERT ON whatsapp_pending_files FOR EACH ROW EXECUTE PROCEDURE set_default_org_id();

-- =====================================================================================
-- 4. Secure RLS Helper Functions
-- =====================================================================================
-- We use SECURITY DEFINER to prevent infinite loops when checking RLS.

CREATE OR REPLACE FUNCTION get_user_orgs()
RETURNS TABLE (org_id UUID, role TEXT) AS $$
BEGIN
    RETURN QUERY SELECT om.org_id, om.role FROM organization_members om WHERE om.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_client_access(check_client_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    has_assignment BOOLEAN;
    client_org UUID;
BEGIN
    SELECT org_id INTO client_org FROM clients WHERE id = check_client_id;
    IF client_org IS NULL THEN RETURN FALSE; END IF;
    
    -- Admin check
    SELECT TRUE INTO is_admin FROM organization_members WHERE user_id = auth.uid() AND org_id = client_org AND role IN ('owner', 'admin');
    IF is_admin THEN RETURN TRUE; END IF;
    
    -- Specific assignment check
    SELECT TRUE INTO has_assignment FROM client_assignments WHERE user_id = auth.uid() AND client_id = check_client_id;
    RETURN COALESCE(has_assignment, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_active_org()
RETURNS UUID AS $$
DECLARE
    active_org UUID;
BEGIN
    SELECT active_org_id INTO active_org FROM profiles WHERE id = auth.uid();
    RETURN active_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================================================
-- 5. Row Level Security (RLS) Matrix
-- =====================================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations: Only members can view. Only owners/admins can update.
CREATE POLICY "Users can view orgs they belong to" ON organizations FOR SELECT USING (id IN (SELECT org_id FROM get_user_orgs()));
CREATE POLICY "Admins can update org" ON organizations FOR UPDATE USING (id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));

-- Organization Members: Members can view each other. Admins can manage.
CREATE POLICY "Members can view coworkers" ON organization_members FOR SELECT USING (org_id IN (SELECT org_id FROM get_user_orgs()));
CREATE POLICY "Admins can insert members" ON organization_members FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));
CREATE POLICY "Admins can update members" ON organization_members FOR UPDATE USING (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));
CREATE POLICY "Admins can delete members" ON organization_members FOR DELETE USING (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));

-- Audit Logs: Read-only for admins. Insert restricted to Postgres Triggers internally.
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));

-- Rewrite Clients RLS
DROP POLICY IF EXISTS "Users can insert their own clients" ON clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;

CREATE POLICY "Admins can insert clients" ON clients FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));
CREATE POLICY "Users view assigned clients" ON clients FOR SELECT USING (has_client_access(id));
CREATE POLICY "Users update assigned clients" ON clients FOR UPDATE USING (has_client_access(id));
CREATE POLICY "Admins delete clients" ON clients FOR DELETE USING (org_id IN (SELECT org_id FROM get_user_orgs() WHERE role IN ('owner', 'admin')));

-- Rewrite Invoices RLS
DROP POLICY IF EXISTS "Users can insert their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can view their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON invoices;

CREATE POLICY "Users can insert invoices for assigned clients" ON invoices FOR INSERT WITH CHECK (has_client_access(client_id));
CREATE POLICY "Users can view invoices for assigned clients" ON invoices FOR SELECT USING (has_client_access(client_id));
CREATE POLICY "Users can update invoices for assigned clients" ON invoices FOR UPDATE USING (has_client_access(client_id));
CREATE POLICY "Users can delete invoices for assigned clients" ON invoices FOR DELETE USING (has_client_access(client_id));

-- =====================================================================================
-- 6. RPC: Secure Firm Join
-- =====================================================================================
CREATE OR REPLACE FUNCTION join_firm(join_code_param TEXT)
RETURNS UUID AS $$
DECLARE
    target_org_id UUID;
    existing_role TEXT;
BEGIN
    -- 1. Find Org
    SELECT id INTO target_org_id FROM organizations WHERE join_code = join_code_param;
    IF target_org_id IS NULL THEN
        RAISE EXCEPTION 'Invalid Join Code';
    END IF;

    -- 2. Check if already member
    SELECT role INTO existing_role FROM organization_members WHERE org_id = target_org_id AND user_id = auth.uid();
    IF existing_role IS NOT NULL THEN
        -- Just set it as active
        UPDATE profiles SET active_org_id = target_org_id WHERE id = auth.uid();
        RETURN target_org_id;
    END IF;

    -- 3. Add to members
    INSERT INTO organization_members (org_id, user_id, role) VALUES (target_org_id, auth.uid(), 'accountant');
    
    -- 4. Set active
    UPDATE profiles SET active_org_id = target_org_id WHERE id = auth.uid();
    
    RETURN target_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- 7. Audit Logging Trigger
-- =====================================================================================
CREATE OR REPLACE FUNCTION log_invoice_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID := auth.uid();
    action_type TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'INSERT_INVOICE';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, new_state)
        VALUES (NEW.org_id, current_user_id, action_type, 'invoices', NEW.id, row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'UPDATE_INVOICE';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state, new_state)
        VALUES (NEW.org_id, current_user_id, action_type, 'invoices', NEW.id, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'DELETE_INVOICE';
        INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, previous_state)
        VALUES (OLD.org_id, current_user_id, action_type, 'invoices', OLD.id, row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE PROCEDURE log_invoice_changes();

-- =====================================================================================
-- 8. Replace decrement_credits to use Organization Wallet
-- =====================================================================================
CREATE OR REPLACE FUNCTION decrement_credits(user_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
    current_credits INTEGER;
    user_active_org_id UUID;
BEGIN
    -- Get the user's active org
    SELECT active_org_id INTO user_active_org_id FROM profiles WHERE id = user_id_param;
    
    -- Fallback to the org they own if active_org_id is null (for backwards safety)
    IF user_active_org_id IS NULL THEN
        SELECT id INTO user_active_org_id FROM organizations WHERE owner_id = user_id_param LIMIT 1;
    END IF;

    IF user_active_org_id IS NULL THEN
        RETURN -1; -- No wallet found
    END IF;

    UPDATE organizations
    SET credits = credits - 1
    WHERE id = user_active_org_id AND credits > 0
    RETURNING credits INTO current_credits;
  
    RETURN COALESCE(current_credits, -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
