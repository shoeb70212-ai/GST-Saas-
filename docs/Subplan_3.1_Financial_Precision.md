# Subplan 3.1: Financial Precision Review (FinOps/Finance)

## 1. Problem Discovered
During the Financial Precision Review, the `agency-finance-tracker` discovered a major accounting presentation bug. 
The global currency formatting utility (`frontend/src/utils/format.ts`) was forcing `maximumFractionDigits: 0`. This instructed the browser's `Intl.NumberFormat` to completely strip all decimals (paise) from monetary values and round them to the nearest integer.

In GST and financial accounting, exact precision to two decimal places is a strict legal requirement. Hiding the paise caused the Dashboard totals to mismatch the raw invoice data, breaking trust for CAs trying to reconcile ledgers.

## 2. Solution & Changes Made
We updated the global currency formatter to enforce exact 2-decimal precision.

**Fixes Applied:**
1. **TypeScript Update**: Modified `frontend/src/utils/format.ts` to include:
   - `minimumFractionDigits: 2`
   - `maximumFractionDigits: 2`

**Impact:**
Because this is a central utility function (`formatCurrency`), this single line change immediately propagated the fix to:
- The Global Dashboard Widgets (Total Taxable, CGST, etc.)
- The Saved Invoices Data Table
- The Invoice Details Modal
- The Tax Liability Predictor Ledger

## 3. Files Modified
- **Modified**: `frontend/src/utils/format.ts`

## 4. Verification
The backend PostgreSQL schema was already correctly configured to store these values using `DECIMAL(12,2)`. Therefore, no historical precision data was lost; it was purely a presentation issue that has now been permanently resolved.

