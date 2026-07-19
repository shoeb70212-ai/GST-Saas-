# Subplan 4.1: Accessibility Audit & Fixes (UX/UI Auditor)

## 1. Problem Discovered
The `agency-accessibility-auditor` scanned the core application features and found severe Web Content Accessibility Guidelines (WCAG 2.1) violations. 
While marketing pages had some basic ARIA bindings, the data-heavy screens were entirely opaque to screen readers. Specifically:
- **Modals (`Modal.tsx`, `InvoiceDetailsModal.tsx`)** lacked `role="dialog"`, `aria-modal`, and proper labeling, meaning screen readers would "bleed" out into the background page while the modal was open.
- **Action Buttons** (like the PII toggles) lacked descriptive `aria-label` and `aria-pressed` state.
- **Data Tables (`ReconciliationPage.tsx`)** did not use `scope="col"` headers or table container `tabIndex` bindings, trapping keyboard users and scrambling data relationships for visually impaired accountants.

## 2. Solution & Changes Made
We injected standard HTML5 and ARIA markers into the React component layer.

**Fixes Applied:**
1. **`Modal.tsx`**: 
   - Attached `role="dialog"` and `aria-modal="true"` to the core `motion.div`.
   - Linked the modal title element to the container using `aria-labelledby`.
2. **`InvoiceDetailsModal.tsx`**:
   - Added descriptive `aria-label`s to the Close button and the "Show/Hide Sensitive Data" toggle button.
   - Added `aria-pressed={showSensitiveData}` for immediate feedback to assistive devices.
3. **`ReconciliationPage.tsx`**:
   - Added `scope="col"` to every `<th>` header element in the desktop table.
   - Added `tabIndex={0}`, `role="region"`, and an `aria-label` to the scrollable table wrapper, allowing keyboard-only users to safely tab into and scroll horizontally through the data grids.

## 3. Files Modified
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/components/InvoiceDetailsModal.tsx`
- `frontend/src/pages/ReconciliationPage.tsx`

## 4. Why This Matters
Accessibility is not just an aesthetic enhancement; it is a compliance requirement for enterprise software procurement. Ensuring that visually impaired or keyboard-reliant CAs can confidently read ledgers and use the software significantly expands the total addressable market (TAM) of KhataLens.

