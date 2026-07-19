# Subplan 1.1: Supabase RLS & Security Audit

## 1. Problem Discovered
During the `agency-application-security-engineer` audit, two severe vulnerabilities were identified that could compromise tenant isolation:

**Vulnerability A: Cross-Tenant Audit Log Spoofing (Trigger Bypass)**
The `set_default_org_id()` trigger used across `invoices` and `clients` tables only set the `org_id` if `NEW.org_id IS NULL`. 
If a malicious user intercepted the API request and explicitly passed an `org_id` belonging to a different firm, the trigger would ignore it. This allowed a bad actor to inject invoices into another firm's database context, polluting their `audit_logs` and causing false billing.

**Vulnerability B: RPC Authorization Bypass**
The `save_invoice_atomic` function is defined as `SECURITY DEFINER` (running as superuser, bypassing RLS). It was blindly accepting the `user_id` and `client_id` provided in the JSON payload without verifying if the executing user actually owned that `user_id` or had access to that `client_id`. This meant any authenticated user could insert invoices on behalf of ANY other user in the system.

## 2. Solution & Changes Made
We created a new SQL migration file: `migration_phase45_security_audit_fixes.sql`.

**Fixes Applied:**
1. **Hardened `set_default_org_id`**: Rewrote the trigger to forcefully overwrite `NEW.org_id` based *strictly* on `auth.uid()`, ignoring any user-supplied `org_id`.
2. **Dedicated Invoice Trigger**: Created `set_invoice_org_id()` specifically for the `invoices` table. It ensures that an invoice *always* inherits its `org_id` from the associated `clients` table, preventing multi-tenant data poisoning.
3. **RPC Auth Verification**: Added explicit security checks inside `save_invoice_atomic`:
   - Enforced `(invoice_data->>'user_id')::UUID = auth.uid()`
   - Enforced `has_client_access((invoice_data->>'client_id')::UUID) = TRUE`

## 3. Files Modified
- **Created**: `migration_phase45_security_audit_fixes.sql`

## 4. Revert / Rollback Plan
If these security checks break existing upload flows (e.g., if the frontend is sending mismatched user IDs), you can instantly revert to the previous state by running the following SQL in Supabase:

```sql
-- Revert Invoice Trigger
DROP TRIGGER IF EXISTS trigger_set_invoice_org ON invoices;
CREATE TRIGGER trigger_set_invoice_org 
    BEFORE INSERT ON invoices 
    FOR EACH ROW EXECUTE PROCEDURE set_default_org_id();

-- Revert Generic Trigger
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

-- Revert RPC (Removing Auth Checks)
-- Re-run the save_invoice_atomic function definition from migration_phase30_virtual_cfo.sql
```
