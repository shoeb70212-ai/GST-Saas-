-- migration_phase35_reconciliation.sql

-- 1. Update Invoices Table for Payment Tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'UNPAID';
-- Ensure paid amount never exceeds total amount (Prevents Concurrency Race Conditions)
ALTER TABLE invoices ADD CONSTRAINT check_paid_amount_valid CHECK (paid_amount <= total_amount);

-- 2. Update Bank Transactions for Allocation Tracking
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_fully_allocated BOOLEAN DEFAULT FALSE;

-- 3. Update Clients Table for Reconciliation Settings
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auto_approve_exact_matches BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reconciliation_run_time TIME;

-- 4. Create Reconciliation Matches Table
CREATE TABLE IF NOT EXISTS reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE CASCADE,
    match_type VARCHAR(50), -- EXACT, PARTIAL, ADVANCE, FIFO
    allocated_amount NUMERIC(15,2),
    status VARCHAR(50) DEFAULT 'SUGGESTED', -- SUGGESTED, APPROVED, REJECTED
    created_by VARCHAR(50) DEFAULT 'AI', -- AI or USER
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_client ON reconciliation_matches(client_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_invoice ON reconciliation_matches(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_bank_txn ON reconciliation_matches(bank_transaction_id);

-- 5. RPC Functions for Atomic Operations
CREATE OR REPLACE FUNCTION approve_reconciliation_match(match_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_match RECORD;
    v_invoice RECORD;
    v_txn RECORD;
    v_new_paid NUMERIC(15,2);
    v_new_alloc NUMERIC(15,2);
    v_payment_status VARCHAR(50);
    v_is_fully BOOLEAN;
BEGIN
    SELECT * INTO v_match FROM reconciliation_matches WHERE id = match_id_param;
    IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
    IF v_match.status = 'APPROVED' THEN RAISE EXCEPTION 'Match already approved'; END IF;

    IF v_match.invoice_id IS NOT NULL THEN
        SELECT * INTO v_invoice FROM invoices WHERE id = v_match.invoice_id FOR UPDATE;
        v_new_paid := v_invoice.paid_amount + v_match.allocated_amount;
        IF abs(v_invoice.total_amount - v_new_paid) <= 1.0 THEN v_payment_status := 'PAID';
        ELSE v_payment_status := 'PARTIAL'; END IF;
        IF v_new_paid > v_invoice.total_amount + 1.0 THEN RAISE EXCEPTION 'Cannot overpay invoice'; END IF;
        UPDATE invoices SET paid_amount = v_new_paid, payment_status = v_payment_status WHERE id = v_match.invoice_id;
    END IF;

    SELECT * INTO v_txn FROM bank_transactions WHERE id = v_match.bank_transaction_id FOR UPDATE;
    v_new_alloc := v_txn.allocated_amount + v_match.allocated_amount;
    IF abs(COALESCE(v_txn.withdrawal, 0) - v_new_alloc) <= 1.0 THEN v_is_fully := TRUE;
    ELSE v_is_fully := FALSE; END IF;
    UPDATE bank_transactions SET allocated_amount = v_new_alloc, is_fully_allocated = v_is_fully WHERE id = v_match.bank_transaction_id;
    
    UPDATE reconciliation_matches SET status = 'APPROVED' WHERE id = match_id_param;
END;
$$;

CREATE OR REPLACE FUNCTION undo_reconciliation_match(match_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_match RECORD;
    v_invoice RECORD;
    v_txn RECORD;
    v_new_paid NUMERIC(15,2);
    v_new_alloc NUMERIC(15,2);
    v_payment_status VARCHAR(50);
BEGIN
    SELECT * INTO v_match FROM reconciliation_matches WHERE id = match_id_param FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
    IF v_match.status != 'APPROVED' THEN RAISE EXCEPTION 'Can only undo approved matches'; END IF;

    IF v_match.invoice_id IS NOT NULL THEN
        SELECT * INTO v_invoice FROM invoices WHERE id = v_match.invoice_id FOR UPDATE;
        v_new_paid := GREATEST(0, v_invoice.paid_amount - v_match.allocated_amount);
        IF v_new_paid > 0 THEN v_payment_status := 'PARTIAL'; ELSE v_payment_status := 'UNPAID'; END IF;
        UPDATE invoices SET paid_amount = v_new_paid, payment_status = v_payment_status WHERE id = v_match.invoice_id;
    END IF;

    SELECT * INTO v_txn FROM bank_transactions WHERE id = v_match.bank_transaction_id FOR UPDATE;
    v_new_alloc := GREATEST(0, v_txn.allocated_amount - v_match.allocated_amount);
    UPDATE bank_transactions SET allocated_amount = v_new_alloc, is_fully_allocated = FALSE WHERE id = v_match.bank_transaction_id;
    
    DELETE FROM reconciliation_matches WHERE id = match_id_param;
END;
$$;
