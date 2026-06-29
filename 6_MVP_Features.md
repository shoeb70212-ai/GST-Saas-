# PayForce: MVP Features & Add-ons (InvoiceScanner AI)

With the engine (GPT-4o-mini) and business model (Credit Packs) locked in, here is the exact feature list required to launch a Minimum Viable Product (MVP) that users will actually pay for.

## 1. Core MVP Features (Must-Haves for Launch)
*   **Auth & Credit Wallet**: Sign up via Supabase, track remaining credits.
*   **The Ingestion Zone**: Mobile Camera capture and Desktop PDF drag-and-drop.
*   **The Verification Grid**: Editable spreadsheet UI to fix OCR errors.
*   **Excel Export**: Download verified data as `.xlsx`.
*   **Batch Processing**: Upload and process multiple PDFs/Images simultaneously.

---

## 2. The "Killer Add-ons" (To completely dominate the market)

Based on your feedback that the user should be able to decide which details they need, and looking for other ways to add massive value, here are 3 advanced features we can build:

### A. Dynamic Custom Fields (User-Defined Extraction)
You mentioned: *"it should be according to user which details he needs"*.
*   **How it works**: Instead of hardcoding the fields, we give the user a "Schema Builder". They can type: *"I also want to extract the Vehicle Number and the E-Way Bill Number"*. 
*   **The Tech**: We dynamically inject their custom fields into the GPT-4o-mini Structured Output schema. The AI adapts instantly. If a user *does* want line items, they toggle a switch, and the AI extracts them.

### B. Direct Tally XML Export (The "WOW" Factor)
Exporting to Excel is great, but the accountant still has to map the Excel columns to Tally.
*   **How it works**: We generate a native `Tally XML` file instead of just an Excel file.
*   **The Value**: The CA literally clicks "Import Data -> Vouchers" in Tally, selects your XML file, and 100 invoices are instantly injected into Tally with zero manual work. This makes your SaaS irresistible to Chartered Accountants.

### C. WhatsApp Bot Ingestion
Business owners are busy and might forget to log into your web app.
*   **How it works**: They just take a photo of the physical invoice and send it to your SaaS's WhatsApp number.
*   **The Value**: The WhatsApp bot automatically deducts 1 credit, extracts the data via GPT-4o-mini, and saves it to their dashboard. The bot replies: *"Invoice saved! Total: ₹5,400. Remaining Credits: 89"*.
*   *(Note: This requires a WhatsApp Business API like Twilio/Interakt, so it should probably be a V2 feature, but it is a massive selling point).*
