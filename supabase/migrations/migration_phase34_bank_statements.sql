-- migration_phase34_bank_statements.sql

CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    bank_name VARCHAR(100),
    account_number VARCHAR(100),
    status VARCHAR(50) DEFAULT 'processing', -- processing, completed, failed
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE,
    txn_date DATE,
    description TEXT,
    reference_no VARCHAR(255),
    cheque_number VARCHAR(100),
    withdrawal NUMERIC(15, 2),
    deposit NUMERIC(15, 2),
    balance NUMERIC(15, 2),
    has_math_error BOOLEAN DEFAULT FALSE,
    needs_manual_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by statement
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement ON bank_transactions(statement_id);
