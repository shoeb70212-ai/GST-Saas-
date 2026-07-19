-- migration_phase51_security_sprint.sql
-- Fixes RLS policies to align with Enterprise RBAC (Phase 38)
-- Replaces flawed auth.uid() checks with has_client_access() for full tenant isolation

-- 1. Fix bank_statements RLS
DROP POLICY IF EXISTS "CA can access their clients' bank statements" ON bank_statements;
CREATE POLICY "Users view assigned bank statements" ON bank_statements FOR SELECT USING (has_client_access(client_id));
CREATE POLICY "Users insert assigned bank statements" ON bank_statements FOR INSERT WITH CHECK (has_client_access(client_id));
CREATE POLICY "Users update assigned bank statements" ON bank_statements FOR UPDATE USING (has_client_access(client_id));
CREATE POLICY "Users delete assigned bank statements" ON bank_statements FOR DELETE USING (has_client_access(client_id));

-- 2. Fix reconciliation_matches RLS
DROP POLICY IF EXISTS "CA can access their clients' reconciliation matches" ON reconciliation_matches;
CREATE POLICY "Users view assigned reconciliation matches" ON reconciliation_matches FOR SELECT USING (has_client_access(client_id));
CREATE POLICY "Users insert assigned reconciliation matches" ON reconciliation_matches FOR INSERT WITH CHECK (has_client_access(client_id));
CREATE POLICY "Users update assigned reconciliation matches" ON reconciliation_matches FOR UPDATE USING (has_client_access(client_id));
CREATE POLICY "Users delete assigned reconciliation matches" ON reconciliation_matches FOR DELETE USING (has_client_access(client_id));

-- 3. Fix bank_transactions RLS
DROP POLICY IF EXISTS "CA can access their clients' bank transactions" ON bank_transactions;
CREATE POLICY "Users view assigned bank transactions" ON bank_transactions FOR SELECT USING (
    statement_id IN (SELECT id FROM bank_statements WHERE has_client_access(client_id))
);
CREATE POLICY "Users insert assigned bank transactions" ON bank_transactions FOR INSERT WITH CHECK (
    statement_id IN (SELECT id FROM bank_statements WHERE has_client_access(client_id))
);
CREATE POLICY "Users update assigned bank transactions" ON bank_transactions FOR UPDATE USING (
    statement_id IN (SELECT id FROM bank_statements WHERE has_client_access(client_id))
);
CREATE POLICY "Users delete assigned bank transactions" ON bank_transactions FOR DELETE USING (
    statement_id IN (SELECT id FROM bank_statements WHERE has_client_access(client_id))
);
