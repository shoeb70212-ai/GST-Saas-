# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bank-statements.spec.ts >> Bank Statements UI >> should display the empty state when no client is selected
- Location: e2e\bank-statements.spec.ts:11:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /No Client Selected/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /No Client Selected/i })

```

```yaml
- banner:
  - navigation "Primary navigation":
    - link "KhataLens Home":
      - /url: /
      - text: KhataLens
    - link "Features":
      - /url: "#features"
    - link "Pricing":
      - /url: "#pricing"
    - link "FAQ":
      - /url: "#faq"
    - link "Sign In":
      - /url: /auth
    - link "Start Free":
      - /url: /auth
- region "From receipt scan to bank reconciliation.":
  - text: Built exclusively for Indian Chartered Accountants
  - heading "From receipt scan to bank reconciliation." [level=1]:
    - text: From receipt scan
    - emphasis: to bank reconciliation.
  - paragraph: KhataLens reads your messy bills, extracts the data, and reconciles it against bank statements. All AI. Zero typing.
  - link "Start Free Beta":
    - /url: /auth
  - link "See how it works":
    - /url: "#how-it-works"
  - paragraph: 100 free extractions · No credit card · Instant access
- region "Platform statistics": 0+ CAs in Beta 0k+ Invoices & Txns 0% Recon Accuracy 0 Manual Typing Supabase RLS Isolation End-to-end Encrypted GSTIN Verified Output Tally & Zoho Compatible No Data Retention
- region "Three steps. Zero typing.":
  - text: How It Works
  - heading "Three steps. Zero typing." [level=2]
  - paragraph: From a crumpled bill on your desk to a filed return in minutes.
  - text: "01"
  - heading "Upload Invoices" [level=3]
  - paragraph: Drag & drop PDFs, JPGs, PNGs — even compressed WhatsApp photos. Bulk upload 200 files at once.
  - text: "02"
  - heading "AI Extracts Everything" [level=3]
  - paragraph: Gemini 2.5 Flash reads GSTIN, HSN codes, line items, tax breakdowns, and validates totals in seconds.
  - text: "03"
  - heading "Export & File" [level=3]
  - paragraph: Download a Tally-ready Excel file. Import directly into your accounting software. Done.
- region "Built for the way CAs actually work.":
  - text: Features
  - heading "Built for the way CAs actually work." [level=2]
  - paragraph: Every feature was designed after talking to practicing Chartered Accountants about their real pain points.
  - text: Core AI Engine
  - heading "37-field extraction. Nothing slips through." [level=3]
  - paragraph: KhataLens acts like a Senior Accountant, not a simple OCR tool. It understands the distinction between CGST, SGST, and IGST. It cross-verifies line-item subtotals against the grand total. It reads Place of Supply and derives the correct inter-state or intra-state tax treatment — automatically.
  - list "Core AI Engine feature list":
    - listitem: Full line-item extraction with HSN codes
    - listitem: Automatic CGST / SGST / IGST classification
    - listitem: Cross-verification of tax totals
    - listitem: Reads skewed photos & WhatsApp-compressed images
  - text: Supplier GSTIN 27ABCDE1234F1Z5 State Code 27 — Maharashtra Item Steel Pipes HSN 7306 Qty 50 pcs Taxable ₹25,000 CGST 9% ₹2,250 SGST 9% ₹2,250 Total ₹29,500 Multi-Tenancy
  - heading "One dashboard. Every client, perfectly isolated." [level=3]
  - paragraph: Managing 50 firms is a different beast from managing 1. KhataLens is built from the ground up for CA practices. Each client gets a fully segregated workspace with its own GSTIN, invoice history, and export records. You can switch between clients in one click — with zero risk of data bleed.
  - list "Multi-Tenancy feature list":
    - listitem: Unlimited client workspaces
    - listitem: Instant one-click context switching
    - listitem: Database-level isolation (RLS enforced)
    - listitem: Per-client GSTIN registration & tracking
  - text: TechCorp India Pvt Ltd 27ABCDE1234F1Z5 148 invoices Sharma Textile Traders 06XYZAB5678C2Z1 93 invoices Gupta Manufacturing Co. 29PQRST9012D3Z7 211 invoices Export Engine
  - heading "One click. Tally-ready in seconds." [level=3]
  - paragraph: Stop reformatting spreadsheets. KhataLens generates an Excel file that maps directly to Tally Prime's purchase voucher import format, Zoho Books' import template, and the GST portal's offline tool. Your data flows from bill to software with zero manual touch.
  - list "Export Engine feature list":
    - listitem: Tally Prime purchase voucher format
    - listitem: Zoho Books & Busy Accounting compatible
    - listitem: GST portal offline tool export
    - listitem: Custom column mapping for any software
  - text: Export Ready Tally Format Date Party GSTIN Amount 12/05 Steel Corp 27AB… ₹29,500 14/05 Tech Ltd 06XY… ₹1,18,000 15/05 Paper Co. 29PQ… ₹8,850
  - button "Download .xlsx"
  - text: Batch Processing
  - heading "100 invoices. 3 minutes flat." [level=3]
  - paragraph: Don't process bills one at a time. KhataLens accepts bulk uploads of up to 200 files at once. Our background queue processes them in parallel — while you work on something else. You get a single notification when the full batch is ready to export.
  - list "Batch Processing feature list":
    - listitem: Bulk upload up to 200 files at once
    - listitem: Background parallel processing queue
    - listitem: Real-time progress tracking
    - listitem: Failed items requeued automatically
  - text: "Batch #247 Processing… invoice_batch_01.pdf Done whatsapp_img_1932.jpg Done bill_gupta_may.pdf Reading… purchase_order.png Queued 2 of 4 complete ~45 sec remaining Bank Statements"
  - heading "Your PDFs, turned into data." [level=3]
  - paragraph: Upload any PDF bank statement. Our specialized extractor pulls every transaction—deposits, withdrawals, and running balances—accurately, no matter how many pages.
  - list "Bank Statements feature list":
    - listitem: Multi-page PDF extraction
    - listitem: Debit/Credit categorization
    - listitem: Math verification on balances
    - listitem: Instant Tally-ready export
  - text: "HDFC Bank Statement.pdf Extracted 12/05 NEFT-UBIN-TechCorp + ₹1,18,000 14/05 UPI/Zomato/Food - ₹850 15/05 RTGS-SBIN-SteelCorp - ₹29,500 Total deposits: ₹1,18,000 Balance: ₹8,45,200 AI Reconciliation"
  - heading "Invoices meet bank txns. Automatically." [level=3]
  - paragraph: Stop checking off lines with a pencil. Our AI matching engine pairs your extracted invoices with your bank statement transactions. Approve exact matches with one click.
  - list "AI Reconciliation feature list":
    - listitem: 2-way fuzzy matching
    - listitem: Handles partial & advance payments
    - listitem: Auto-approve mode for exact matches
    - listitem: Undo history and audit trail
  - text: Steel Corp Invoice INV-2026-041 ₹29,500 100% Exact Match Tx NEFT-RTGS-SteelCorp 15 May 2026 - ₹29,500 WhatsApp Engine
  - heading "Clients forward bills. We do the rest." [level=3]
  - paragraph: Give your clients a dedicated WhatsApp number. They forward photos of restaurant bills, taxi receipts, or vendor invoices. KhataLens automatically assigns them to their workspace and extracts the data.
  - list "WhatsApp Engine feature list":
    - listitem: Zero-friction client uploads
    - listitem: Auto-assign to client workspaces
    - listitem: Handles compressed images
    - listitem: Instant confirmation to clients
  - text: Here's the restaurant bill 10:42 AM KhataLens AI
  - paragraph: "✅ Extracted successfully. Vendor: Biryani House Amount: ₹1,250 Mapped to: Meals & Entertainment"
  - text: 10:43 AM
- region "The Tax OS is just getting started.":
  - text: Roadmap
  - heading "The Tax OS is just getting started." [level=2]
  - paragraph: These features are actively being built. Beta users get first access.
  - article:
    - text: Q3 2026
    - heading "GSTR-2B AI Deep Match" [level=3]
    - paragraph: Upload the government's GSTR-2B JSON. Our AI fuzzy-matches it against your scanned bills, instantly flagging lost ITC due to vendor typos.
  - article:
    - text: Q3 2026
    - heading "Native Android App" [level=3]
    - paragraph: A dedicated Android app for you and your clients. Offline scanning, better edge detection, and push notifications for required approvals.
  - article:
    - text: Q4 2026
    - heading "Tax Liability Predictor" [level=3]
    - paragraph: Import a sales register. KhataLens calculates real-time GST liability (Sales Tax minus ITC), giving clients a cashflow dashboard before filing.
  - article:
    - text: Q4 2026
    - heading "Multi-Currency Recon" [level=3]
    - paragraph: Handle international invoices and bank statements with automatic real-time exchange rate conversions and forex gain/loss calculations.
- region "Simple, honest pricing.":
  - text: Pricing
  - heading "Simple, honest pricing." [level=2]
  - paragraph: Start for free. Scale as your practice grows. No hidden fees.
  - text: Starter ₹999 / month
  - paragraph: Perfect for solo practitioners and small businesses.
  - list "Starter plan features":
    - listitem: 1,000 invoice extractions
    - listitem: 10 bank statement pages
    - listitem: Unlimited workspaces
    - listitem: Excel + CSV export
    - listitem: Email support
  - link "Get Started":
    - /url: /auth
  - text: Pro Most Popular ₹2,499 / month
  - paragraph: Everything in Starter, plus AI Reconciliation and WhatsApp.
  - list "Pro plan features":
    - listitem: 5,000 invoice extractions
    - listitem: Unlimited bank statements
    - listitem: AI Recon Engine (Auto-match)
    - listitem: WhatsApp Receipt Engine
    - listitem: Batch processing queue
    - listitem: Dedicated CA support
  - link "Start Pro Trial":
    - /url: /auth
  - text: CA Firm / Enterprise Custom
  - paragraph: Tailored for large practices with high volumes.
  - list "Enterprise plan features":
    - listitem: Custom extraction volumes
    - listitem: White-labeled portal
    - listitem: API Access for integrations
    - listitem: On-premise deployment options
    - listitem: Dedicated Account Manager
  - link "Contact Sales":
    - /url: mailto:sales@khatalens.com
- region "CAs who switched. They didn't switch back.":
  - text: Testimonials
  - heading "CAs who switched. They didn't switch back." [level=2]:
    - text: CAs who switched.
    - emphasis: They didn't switch back.
  - blockquote:
    - paragraph: "\"I was manually typing data from 200 invoices every quarter. KhataLens cut that to under 20 minutes. The GSTIN validation alone has saved me from 3 penalties this year. This is not a nice-to-have — it is a practice essential.\""
    - text: CA Priya Mehta Partner, Mehta & Associates, Mumbai
  - blockquote:
    - paragraph: "\"The multi-client workspace is exactly what our 40-client practice needed. The fact that the Excel output is pre-formatted for Tally means my junior staff can process a complete set in one sitting. The accuracy on blurry WhatsApp bills genuinely surprised me.\""
    - text: CA Rajesh Gupta Principal, Gupta Tax Consultants, Delhi
  - blockquote:
    - paragraph: "\"I was sceptical about AI for compliance work, but the cross-verification logic convinced me. It does not just extract — it tells me when something looks wrong. That auditability is what I needed before trusting it with client data.\""
    - text: CA Anita Desai Independent Practitioner, Bangalore
- region "Questions CAs actually ask.":
  - text: FAQ
  - heading "Questions CAs actually ask." [level=2]
  - paragraph: No marketing fluff. Straight answers.
  - list:
    - listitem:
      - button "What file formats does KhataLens support?"
    - listitem:
      - button "How accurate is the AI extraction?"
    - listitem:
      - button "Is my client data secure?"
    - listitem:
      - button "Can I manage multiple clients from one account?"
    - listitem:
      - button "Which accounting software can I export to?"
    - listitem:
      - button "How many invoices can I process per month?"
    - listitem:
      - button "Is there a mobile app?"
    - listitem:
      - button "How do I get started?"
- contentinfo:
  - heading "Your practice deserves better tools." [level=2]:
    - text: Your practice deserves
    - emphasis: better tools.
  - paragraph: Join 500+ Chartered Accountants who are already processing invoices in seconds, not hours.
  - link "Start Free — 100 Extractions":
    - /url: /auth
  - paragraph: No credit card · Instant access · Cancel anytime
  - text: KhataLens
  - link "Features":
    - /url: "#features"
  - link "Pricing":
    - /url: "#pricing"
  - link "FAQ":
    - /url: "#faq"
  - link "Sign In":
    - /url: /auth
  - link "Contact":
    - /url: mailto:support@khatalens.com
  - paragraph: © 2026 KhataLens. All rights reserved.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
  3  | 
  4  | test.describe('Bank Statements UI', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     const { access_token } = await signUpTestUser();
  7  |     await loginViaSessionInjection(page, access_token);
  8  |     await page.goto('/dashboard/bank-statements');
  9  |   });
  10 | 
  11 |   test('should display the empty state when no client is selected', async ({ page }) => {
  12 |     // Wait for the empty state heading
  13 |     const heading = page.getByRole('heading', { name: /No Client Selected/i });
> 14 |     await expect(heading).toBeVisible();
     |                           ^ Error: expect(locator).toBeVisible() failed
  15 |   });
  16 | });
  17 | 
```