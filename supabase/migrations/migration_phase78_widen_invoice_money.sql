-- Widen invoice money columns; drop/recreate generated gst_math_valid first.
ALTER TABLE invoices DROP COLUMN IF EXISTS gst_math_valid;

ALTER TABLE invoices
  ALTER COLUMN taxable_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN cgst_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN sgst_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN igst_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN round_off TYPE NUMERIC(18, 2),
  ALTER COLUMN total_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN gst_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN received_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN balance_amount TYPE NUMERIC(18, 2),
  ALTER COLUMN previous_balance TYPE NUMERIC(18, 2),
  ALTER COLUMN current_balance TYPE NUMERIC(18, 2),
  ALTER COLUMN cess_amount TYPE NUMERIC(18, 2);

ALTER TABLE invoice_line_items
  ALTER COLUMN quantity TYPE NUMERIC(18, 4),
  ALTER COLUMN unit_price TYPE NUMERIC(18, 4),
  ALTER COLUMN amount TYPE NUMERIC(18, 2),
  ALTER COLUMN tax_rate TYPE NUMERIC(8, 4);

ALTER TABLE invoices
  ADD COLUMN gst_math_valid boolean
  GENERATED ALWAYS AS (
    round(
      (
        COALESCE(taxable_amount, 0)
        + COALESCE(cgst_amount, 0)
        + COALESCE(sgst_amount, 0)
        + COALESCE(igst_amount, 0)
        + COALESCE(round_off, 0)
      ),
      2
    ) = round(COALESCE(total_amount, 0), 2)
  ) STORED;
