# PayForce: Product Strategy & Evolution

This document tracks the strategic pivots of the product, starting from the initial vision to the final, highly defensible product blueprint.

## Evolution of the Idea

1.  **V1 Vision: The AR Debt Tracker**
    *   *Concept*: MSME suppliers manually enter their unpaid invoices to generate legal dunning notices based on MSMED and GST laws.
    *   *Why we pivoted*: Double data entry friction. Users won't manually type invoices into a separate tracking app if they already use Tally.
2.  **V2 Vision: The Invoice Generator**
    *   *Concept*: Become the primary tool where MSMEs generate their invoices, automatically embedding legal threats (3x RBI interest) on the PDF footer.
    *   *Why we pivoted*: The switching cost is too high. Asking an MSME to abandon Tally or Zoho for an unproven invoice generator will block adoption.
3.  **V3 Vision: The AP Compliance Dashboard**
    *   *Concept*: Target large buyers. They upload incoming invoices, and the SaaS tracks the 45-day MSMED deadline to avoid Section 43B(h) income tax disallowances.
    *   *Why we pivoted*: Head-to-head competition. TallyPrime and ClearTax already launched this exact dashboard natively. We have no distribution moat to beat them.
4.  **V4 Final Blueprint: The AI Data-Entry Bridge (InvoiceScanner AI)**
    *   *Concept*: We do not compete with Tally; we make Tally better. We build a Camera-First/PDF-Upload OCR tool. The user snaps a photo of a messy physical invoice (or uploads a batch of PDFs). We extract the core compliance fields using a Vision LLM and export a perfectly formatted Excel/CSV file for the Chartered Accountant (CA) to ingest into Tally.

## The Value Proposition (Why Us?)

*   **Frictionless Workflow**: We eliminate the biggest pain point in accounting—manual data entry. The business owner takes a photo, and the CA gets a clean spreadsheet.
*   **Compliance Ready**: We specifically train the AI to extract fields critical for Section 43B(h) and GST compliance (Supplier Name, GSTIN, Date, Total Amount, GST Amount).
*   **Zero Switching Cost**: They keep their existing software. We are just an intelligent "scanner-to-excel" bridge.
