-- =====================================================================================
-- Migration Phase 41: Token & Usage Audit Tracking
-- =====================================================================================

-- 1. Create credit_usage_logs table
CREATE TABLE IF NOT EXISTS credit_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    file_name TEXT,
    tokens_used INTEGER DEFAULT 0,
    credits_deducted INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_org_id ON credit_usage_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_created_at ON credit_usage_logs(created_at DESC);

-- Enable RLS
ALTER TABLE credit_usage_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view logs for organizations they have access to
CREATE POLICY "Users can view usage logs for their orgs"
ON credit_usage_logs
FOR SELECT
USING (
    org_id IN (SELECT org_id FROM get_user_orgs())
);

-- 2. Update decrement_credits to atomically log usage
DROP FUNCTION IF EXISTS decrement_credits(UUID, INT);

CREATE OR REPLACE FUNCTION decrement_credits(
    user_id_param UUID, 
    amount INT DEFAULT 1,
    task_type_param TEXT DEFAULT 'invoice_scan',
    file_name_param TEXT DEFAULT NULL,
    tokens_used_param INT DEFAULT 0,
    status_param TEXT DEFAULT 'success'
)
RETURNS INTEGER AS $$
DECLARE
    current_credits INTEGER;
    user_active_org_id UUID;
BEGIN
    -- Get the user's active org
    SELECT active_org_id INTO user_active_org_id FROM profiles WHERE id = user_id_param;
    
    -- Fallback to the org they own if active_org_id is null
    IF user_active_org_id IS NULL THEN
        SELECT id INTO user_active_org_id FROM organizations WHERE owner_id = user_id_param LIMIT 1;
    END IF;

    IF user_active_org_id IS NULL THEN
        RETURN -1; -- No wallet found
    END IF;

    -- Only deduct if amount > 0
    IF amount > 0 THEN
        UPDATE organizations
        SET credits = credits - amount
        WHERE id = user_active_org_id AND credits >= amount
        RETURNING credits INTO current_credits;

        IF current_credits IS NULL THEN
            RETURN -1; -- Insufficient credits
        END IF;
    ELSE
        -- If amount is 0, we still want to log but not deduct. Just fetch current credits.
        SELECT credits INTO current_credits FROM organizations WHERE id = user_active_org_id;
    END IF;

    -- Insert audit log in the same transaction
    INSERT INTO credit_usage_logs (user_id, org_id, task_type, file_name, tokens_used, credits_deducted, status)
    VALUES (user_id_param, user_active_org_id, task_type_param, file_name_param, tokens_used_param, amount, status_param);
  
    RETURN COALESCE(current_credits, -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
