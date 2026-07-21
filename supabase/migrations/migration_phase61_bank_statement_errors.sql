-- Phase 61: Bank statement failure diagnostics
ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS error_message TEXT;
