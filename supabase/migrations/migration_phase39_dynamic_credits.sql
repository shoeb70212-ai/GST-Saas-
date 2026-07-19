-- =====================================================================================
-- Migration Phase 39: Dynamic Weighted Credits
-- =====================================================================================

-- Drop the old signature
DROP FUNCTION IF EXISTS decrement_credits(UUID);

-- Recreate with dynamic amount parameter (defaulting to 1 for backwards compatibility)
CREATE OR REPLACE FUNCTION decrement_credits(user_id_param UUID, amount INT DEFAULT 1)
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
    SET credits = credits - amount
    WHERE id = user_active_org_id AND credits >= amount
    RETURNING credits INTO current_credits;
  
    RETURN COALESCE(current_credits, -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
