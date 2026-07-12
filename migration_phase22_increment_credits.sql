-- Migration: Add atomic increment_credits RPC
-- Replaces non-atomic GET/PATCH logic in payment processing

CREATE OR REPLACE FUNCTION increment_credits(user_id_param UUID, amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + amount
  WHERE id = user_id_param;
END;
$$;

-- Revoke execute from public to prevent arbitrary execution from frontend
REVOKE EXECUTE ON FUNCTION increment_credits(UUID, INT) FROM public;
REVOKE EXECUTE ON FUNCTION increment_credits(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_credits(UUID, INT) FROM authenticated;

-- Only allow service role to execute this (called from our backend)
GRANT EXECUTE ON FUNCTION increment_credits(UUID, INT) TO service_role;
