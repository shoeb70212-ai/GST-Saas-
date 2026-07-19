-- Phase 49: Global Rate Limiting (SRE/DevOps)

-- We implement a Sliding Window Rate Limiter directly on the invoices table.
-- This prevents "Denial of Wallet" attacks where malicious users spam the
-- database with thousands of uploads to spike AI OCR bills.

CREATE OR REPLACE FUNCTION enforce_invoice_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_recent_count INT;
    v_limit INT := 100; -- Max 100 invoices
    v_window_minutes INT := 10; -- per 10 minutes
BEGIN
    -- Only enforce for standard users (auth.uid() is not null)
    -- This allows internal system roles (like service_role) to bypass if needed
    IF auth.uid() IS NOT NULL THEN
        
        -- Count how many invoices this exact user has inserted in the last X minutes
        SELECT COUNT(id) INTO v_recent_count
        FROM invoices
        WHERE user_id = NEW.user_id 
        AND created_at > NOW() - (v_window_minutes || ' minutes')::INTERVAL;
        
        -- If they exceed the limit, block the transaction
        IF v_recent_count >= v_limit THEN
            RAISE EXCEPTION 'Rate limit exceeded: You can only upload % invoices per % minutes. Please try again later.', v_limit, v_window_minutes
                USING ERRCODE = '42900'; -- Custom error code mapping to HTTP 429 Too Many Requests
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop trigger if it already exists
DROP TRIGGER IF EXISTS trigger_enforce_invoice_rate_limit ON invoices;

-- Create the BEFORE INSERT trigger on the invoices table
CREATE TRIGGER trigger_enforce_invoice_rate_limit
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION enforce_invoice_rate_limit();

-- Note: We only rate limit INSERTS because that is what triggers the expensive OCR pipeline.
-- Updates to existing invoices do not incur external AI API costs.
