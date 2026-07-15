# Architecture: Tax Liability Predictor

## 1. Overview
The Tax Liability Predictor is a CFO-grade cashflow dashboard designed to give Chartered Accountants real-time visibility into their client's upcoming GST payments. Rather than relying on simple "Estimated Sales" inputs, this module programmatically digests standard GSTR-1 Excel files to calculate exact Output Tax and offsets it against eligible Matched Purchase ITC.

## 2. Core Mathematical Rule
`Cash Liability = (Current Output Tax) - (Current Eligible ITC) - (Carry-Forward ITC)`

> [!IMPORTANT]
> **Zero Hallucination Constraint:** The Eligible ITC is strictly calculated using invoices that have a `recon_status = 'matched'`. Unreconciled bills or those missing in GSTR-2B are completely ignored. This ensures a pessimistic, conservative estimate that prevents the CA from under-preparing cash reserves.

## 3. Database Layer (`sales_records`)
We introduced the `sales_records` table alongside an advanced Supabase RPC.

### Schema Additions
- **`customer_gstin`**: Tracks the B2B buyer.
- **`invoice_type`**: `B2B` vs `B2C`.
- **`is_credit_note`**: A boolean flag denoting if the record mathematically reduces Output Tax.

### The Carry-Forward RPC
The function `get_tax_liability_prediction(client_id, period)` performs:
1. **Current Output Tax:** Sums `igst + cgst + sgst` from `sales_records` for the target period.
2. **Current ITC:** Sums `igst_amount + cgst_amount + sgst_amount` from `invoices` for the target period (where matched).
3. **Historical Roll-Over:** Sums all historical ITC and subtracts historical Sales Tax. Any positive balance is injected as `carry_forward_itc`.
4. **Final Liability Computation:** Applies the standard offset logic.

## 4. Backend GSTR-1 Parser (`sales_routes.py`)
To prevent CAs from performing manual data entry, the backend accepts a direct upload of the government-standard **GSTR-1 Excel File**.

### Parser Capabilities
- **Pandas Dataframe Engine:** Uses `openpyxl` and `pandas` to read `.xlsx` files entirely in-memory.
- **Dual-Sheet Processing:** Automatically seeks and parses the `B2B` sheet (Business to Business) and the `b2cs` sheet (Business to Consumer Small).
- **Credit Note Detection:** Scans the `taxable_value` column. Any negative float is automatically parsed, multiplied appropriately, and flagged with `is_credit_note = True` to legally reduce the Output Tax footprint without causing parser crashes.
- **Idempotent Bulk Inserts:** Uploading the same GSTR-1 twice simply deletes the old `sales_records` for that period and bulk-inserts the fresh chunk.

## 5. Frontend Dashboard (`TaxLiabilityPage.tsx`)
The frontend leverages a visual ledger approach instead of standard data tables.

- **Ledger Component:** Large, bold typography specifically designed for iPad/Desktop presentations, rendering the `Output Tax -> ITC Offset -> Carry-Forward Offset -> Final Cash Liability` mathematical flow.
- **Zero-Friction Upload:** A drag-and-drop file input for the GSTR-1 that feeds directly into the FastAPI backend via a Bearer-token authorized `multipart/form-data` request.
