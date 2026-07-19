# Subplan 1.2: Data Privacy & Compliance (DPO Audit)

## 1. Problem Discovered
The `agency-data-privacy-officer` audited the database and frontend application for compliance with the DPDP (Digital Personal Data Protection) Act and general financial data security standards.

**Findings:**
1. Sensitive financial PII such as `supplier_pan`, `buyer_pan`, and `account_number` were being stored in plaintext and rendered directly to the screen.
2. Personally Identifiable Information (PII) such as `supplier_phone` and `supplier_email` were also rendered in plaintext on shared dashboards.
3. While Supabase provides AES-256 disk encryption, this does not protect against "shoulder surfing" (unauthorized viewing of an open screen in an accountant's office).

## 2. Solution & Changes Made
Rather than implementing destructive column-level database encryption (which would permanently break the application's search and export functionalities), we implemented a **Frontend Dynamic Data Masking (DDM)** layer.

**Fixes Applied:**
1. **Masking Utility**: Created `frontend/src/utils/masking.ts` with dedicated functions to mask PAN (`XXXXXX1234`), Bank Accounts (`******1234`), Phone Numbers, and Emails.
2. **Global Visibility Toggle**: Introduced a `showSensitiveData` state in `SavedInvoicesPage.tsx` and `InvoiceDetailsModal.tsx`.
3. **UI Implementation**: Added an "Eye" toggle button next to the Export buttons. By default, all sensitive data in the data table and detail modal is masked. Users must explicitly click the Eye icon to temporarily reveal the plaintext data.

## 3. Files Modified
- **Created**: `frontend/src/utils/masking.ts`
- **Modified**: `frontend/src/pages/SavedInvoicesPage.tsx` (Table View)
- **Modified**: `frontend/src/components/InvoiceDetailsModal.tsx` (Modal View)

## 4. Compliance Impact
This change significantly reduces the risk of casual data exposure (shoulder surfing) and ensures the application demonstrates "reasonable security safeguards" for processing financial data under Indian law.

