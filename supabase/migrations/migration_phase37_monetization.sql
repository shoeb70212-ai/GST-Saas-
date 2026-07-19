-- migration_phase37_monetization.sql

-- 1. Extend profiles with tier and expiry
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'pro'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ;

-- 2. Create transactions table for payment ledger
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_id TEXT UNIQUE NOT NULL,
    order_id TEXT NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    credits_added INTEGER NOT NULL,
    plan_purchased TEXT,
    status TEXT DEFAULT 'success',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

-- 3. Atomic RPC to upgrade user tier and add credits
CREATE OR REPLACE FUNCTION upgrade_user_tier(
    user_id_param UUID,
    plan_type_param TEXT,
    credits_param INTEGER,
    amount_paid_param DECIMAL,
    payment_id_param TEXT,
    order_id_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    existing_txn UUID;
BEGIN
    -- Check for idempotency: if payment_id already exists, skip
    SELECT id INTO existing_txn FROM transactions WHERE payment_id = payment_id_param;
    IF existing_txn IS NOT NULL THEN
        RETURN TRUE; -- Already processed
    END IF;

    -- 1. Record the transaction
    INSERT INTO transactions (user_id, payment_id, order_id, amount_paid, credits_added, plan_purchased)
    VALUES (user_id_param, payment_id_param, order_id_param, amount_paid_param, credits_param, plan_type_param);

    -- 2. Update the profile
    UPDATE profiles
    SET 
        credits = credits + credits_param,
        tier = plan_type_param,
        tier_expires_at = NOW() + INTERVAL '30 days'
    WHERE id = user_id_param;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
