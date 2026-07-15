-- migration_phase36_rls_hardening.sql

-- 1. Enable Row Level Security (RLS) on all ledger tables
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;

-- 2. Create missing foreign key indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_bank_statements_client ON bank_statements(client_id);
-- (bank_transactions uses statement_id, so we already indexed it in phase 34)

-- 3. Define RLS Policies
-- CAs can only see bank_statements linked to clients they own
CREATE POLICY "CA can access their clients' bank statements" ON bank_statements
    FOR ALL
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- CAs can only see bank_transactions linked to clients they own (we added client_id to bank_transactions in Phase 34 logic, assuming it exists. If not, via statement)
CREATE POLICY "CA can access their clients' bank transactions" ON bank_transactions
    FOR ALL
    USING (
        statement_id IN (
            SELECT id FROM bank_statements WHERE client_id IN (
                SELECT id FROM clients WHERE user_id = auth.uid()
            )
        )
    );

-- CAs can only see reconciliation_matches linked to clients they own
CREATE POLICY "CA can access their clients' reconciliation matches" ON reconciliation_matches
    FOR ALL
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );
