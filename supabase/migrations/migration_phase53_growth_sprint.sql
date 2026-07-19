-- migration_phase53_growth_sprint.sql
-- Growth & Conversions: Referral Loops and Onboarding Tracking

-- =====================================================================================
-- 1. Referral System
-- =====================================================================================
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate a referral code when an org is created
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO referral_codes (org_id, code)
    VALUES (NEW.id, UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 8)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_generate_referral_code ON organizations;
CREATE TRIGGER trigger_generate_referral_code
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE PROCEDURE generate_referral_code();

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    referred_org_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
    reward_credits INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Referrers can see their own codes and referrals
CREATE POLICY "Orgs can view their own referral code" ON referral_codes
    FOR SELECT USING (org_id IN (SELECT org_id FROM get_user_orgs()));

CREATE POLICY "Orgs can view their referrals" ON referrals
    FOR SELECT USING (referrer_org_id IN (SELECT org_id FROM get_user_orgs()));

-- =====================================================================================
-- 2. Onboarding Funnel Tracking (Product-Led Growth)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS user_onboarding_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL, -- e.g., 'signed_up', 'first_client_added', 'first_invoice_scanned'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_name)
);

ALTER TABLE user_onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own events" ON user_onboarding_events
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own events" ON user_onboarding_events
    FOR SELECT USING (user_id = auth.uid());

-- Trigger to automatically track when a user adds their first client
CREATE OR REPLACE FUNCTION track_first_client_added()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_onboarding_events (user_id, event_name)
    VALUES (NEW.user_id, 'first_client_added')
    ON CONFLICT (user_id, event_name) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_track_first_client ON clients;
CREATE TRIGGER trigger_track_first_client
AFTER INSERT ON clients
FOR EACH ROW EXECUTE PROCEDURE track_first_client_added();
