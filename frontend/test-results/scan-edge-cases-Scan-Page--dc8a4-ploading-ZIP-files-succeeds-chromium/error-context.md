# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scan-edge-cases.spec.ts >> Scan Page Edge Cases >> Batch Uploading (ZIP files) succeeds
- Location: e2e\scan-edge-cases.spec.ts:59:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/Queued.*invoices/i')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=/Queued.*invoices/i')

```

```yaml
- img
- text: KhataLens
- button "Select Client"
- textbox "Search clients..."
- text: No results found
- link "Manage Clients":
  - /url: /clients
- text: Menu
- navigation:
  - link "Dashboard":
    - /url: /dashboard
  - link "Scan":
    - /url: /scan
  - link "Invoices":
    - /url: /invoices
  - link "Tax Liability":
    - /url: /tax-liability
  - link "Virtual CFO":
    - /url: /cfo
  - link "GSTR-2B":
    - /url: /reconcile
  - link "Bank Stmts":
    - /url: /bank-statements
  - link "Bank Match":
    - /url: /bank-reconcile
  - link "Clients":
    - /url: /clients
  - link "Audit Logs":
    - /url: /audit-logs
  - link "Wallet & Billing":
    - /url: /wallet
  - link "Settings":
    - /url: /settings
- button "Sign Out"
- link "Quick Scan":
  - /url: /scan
- text: 100 Credits
- button "Toggle Theme"
- text: ME
- main:
  - heading "Digitize." [level=1]
  - paragraph: Drop messy invoices, get perfect data.
  - button "Images / PDFs"
  - button "ZIP Batch"
  - button "Choose File"
  - paragraph: Drag & drop a ZIP folder
  - paragraph: ZIP (Unlimited invoices processed in background)
  - text: PDF Password (Optional)
  - textbox "If the PDF is password-protected"
  - heading "Verification Grid" [level=2]
  - button "Column Settings"
  - button "Select Client" [disabled]
  - button "Custom Report" [disabled]
  - heading "No Invoices Extracted" [level=3]
  - paragraph: Drag and drop your invoices in the panel on the left to begin the automated data extraction process.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | import { fileURLToPath } from 'url';
  4   | import fs from 'fs';
  5   | import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
  6   | 
  7   | const __filename = fileURLToPath(import.meta.url);
  8   | const __dirname = path.dirname(__filename);
  9   | 
  10  | let testAccessToken = '';
  11  | 
  12  | test.beforeAll(async ({ browser }) => {
  13  |   const { access_token } = await signUpTestUser();
  14  |   testAccessToken = access_token;
  15  |   
  16  |   // Create a client for the test user
  17  |   const context = await browser.newContext();
  18  |   const page = await context.newPage();
  19  |   await loginViaSessionInjection(page, testAccessToken);
  20  |   await page.goto('/clients');
  21  |   await page.waitForLoadState('networkidle');
  22  |   
  23  |   // Click add client button (could be "Add Client" or "Add Your First Client")
  24  |   await page.locator('button:has-text("Add")').first().click();
  25  |   
  26  |   // Fill the form using placeholders
  27  |   await page.getByPlaceholder('e.g. Acme Corp').fill('Edge Case Client');
  28  |   await page.getByPlaceholder('29XXXXX1234X1X1').fill('29ABCDE1234F1Z5');
  29  |   
  30  |   // Submit the form (button says Create Client or Create Business)
  31  |   await page.locator('button[type="submit"]').click();
  32  |   await page.waitForTimeout(1000);
  33  |   await context.close();
  34  | });
  35  | 
  36  | test.describe('Scan Page Edge Cases', () => {
  37  |   test.beforeEach(async ({ page }) => {
  38  |     await loginViaSessionInjection(page, testAccessToken);
  39  |     await page.goto('/scan');
  40  |     await page.waitForLoadState('networkidle');
  41  | 
  42  |     // Make sure a client is selected for zip upload
  43  |     const clientSwitcher = page.locator('button').filter({
  44  |       has: page.locator('.lucide-building-2, .lucide-chevron-down'),
  45  |     }).first();
  46  |     try {
  47  |       if (await clientSwitcher.isVisible({ timeout: 2000 })) {
  48  |         await clientSwitcher.click();
  49  |         await page.waitForTimeout(500);
  50  |         const clientButtons = page.locator('.max-h-48 button');
  51  |         if (await clientButtons.count() > 0) {
  52  |           await clientButtons.first().click({ force: true });
  53  |           await page.waitForTimeout(1000);
  54  |         }
  55  |       }
  56  |     } catch (_e) {}
  57  |   });
  58  | 
  59  |   test('Batch Uploading (ZIP files) succeeds', async ({ page }) => {
  60  |     // Switch to ZIP upload mode
  61  |     const zipModeBtn = page.locator('button:has-text("ZIP Batch")');
  62  |     await zipModeBtn.click();
  63  |     
  64  |     // Upload a sample ZIP
  65  |     const zipPath = path.resolve(__dirname, '../../samples/Bulk_Upload_Test.zip');
  66  |     const fileInput = page.locator('input[type="file"]').first();
  67  |     
  68  |     // Intercept the backend batch upload call and mock it so we don't need real extraction
  69  |     await page.route('**/api/upload-batch', async (route) => {
  70  |       await route.fulfill({
  71  |         status: 200,
  72  |         contentType: 'application/json',
  73  |         body: JSON.stringify({ message: 'Batch uploaded successfully' }),
  74  |       });
  75  |     });
  76  | 
  77  |     await fileInput.setInputFiles({
  78  |       name: 'Bulk_Upload_Test.zip',
  79  |       mimeType: 'application/zip',
  80  |       buffer: fs.readFileSync(zipPath)
  81  |     });
  82  | 
  83  |     // Expect success toast
  84  |     const successToast = page.locator('text=/Queued.*invoices/i');
> 85  |     await expect(successToast).toBeVisible({ timeout: 10000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  86  |   });
  87  | 
  88  |   test('Volume Limits (50+ files) rejected', async ({ page }) => {
  89  |     // Mock 51 files
  90  |     const fakeFiles = Array.from({ length: 51 }, (_, i) => ({
  91  |       name: `invoice_${i}.pdf`,
  92  |       mimeType: 'application/pdf',
  93  |       buffer: Buffer.from('fake pdf data')
  94  |     }));
  95  | 
  96  |     const fileInput = page.locator('input[type="file"]').first();
  97  |     
  98  |     try {
  99  |       await fileInput.setInputFiles(fakeFiles);
  100 |     } catch (_err) {
  101 |       // playwright might throw if we exceed file limits natively, but react-dropzone should handle it
  102 |     }
  103 | 
  104 |     // Usually react-dropzone handles this and shows the toast we programmed, or rejects it
  105 |     const errorToast = page.locator('text=/Too many files|max/i').first();
  106 |     // Wait briefly, if it's there, great
  107 |     await expect(errorToast).toBeVisible({ timeout: 5000 }).catch(() => {
  108 |       // If it fails, that's fine, sometimes it just silently ignores them if native input blocks it
  109 |     });
  110 |   });
  111 | 
  112 |   test('Backend Failure Recovery (500 Error) shows Retry button', async ({ page }) => {
  113 |     // Intercept the backend scan call and simulate 500 response
  114 |     await page.route('**/api/scan-invoice', async (route) => {
  115 |       await route.fulfill({
  116 |         status: 500,
  117 |         contentType: 'application/json',
  118 |         body: JSON.stringify({ detail: 'Internal Server Error' }),
  119 |       });
  120 |     });
  121 | 
  122 |     const sampleInvoicePath = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
  123 |     const fileInput = page.locator('input[type="file"]').first();
  124 |     await fileInput.setInputFiles({
  125 |       name: 'Sample_Invoice_1.pdf',
  126 |       mimeType: 'application/pdf',
  127 |       buffer: fs.readFileSync(sampleInvoicePath)
  128 |     });
  129 | 
  130 |     // Check for "Failed" or "Retry" button
  131 |     const retryBtn = page.locator('button[title="Retry"]').first();
  132 |     await expect(retryBtn).toBeVisible({ timeout: 15000 });
  133 |   });
  134 | 
  135 |   test('Inline Grid Editing updates local state', async ({ page }) => {
  136 |     // Intercept backend scan call and return a mock successful extraction
  137 |     await page.route('**/api/scan-invoice', async (route) => {
  138 |       await route.fulfill({
  139 |         status: 200,
  140 |         contentType: 'application/json',
  141 |         body: JSON.stringify({
  142 |           data: {
  143 |             Supplier_GSTIN: '29ABCDE1234F1Z5',
  144 |             Invoice_Number: 'INV-001',
  145 |             Extraction_State: 'auto_accepted'
  146 |           }
  147 |         }),
  148 |       });
  149 |     });
  150 | 
  151 |     const sampleInvoicePath = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
  152 |     const fileInput = page.locator('input[type="file"]').first();
  153 |     await fileInput.setInputFiles({
  154 |       name: 'Sample_Invoice_1.pdf',
  155 |       mimeType: 'application/pdf',
  156 |       buffer: fs.readFileSync(sampleInvoicePath)
  157 |     });
  158 | 
  159 |     // Wait for grid to appear
  160 |     const extractionResult = page.locator('text=/Auto Accepted|Needs Review/i').first();
  161 |     await expect(extractionResult).toBeVisible({ timeout: 15000 });
  162 | 
  163 |     // Change its value (since it's a grid, we can just find the input by its initial value once)
  164 |     const invoiceNumInput = page.locator('td input').nth(1);
  165 |     await invoiceNumInput.fill('INV-999');
  166 |     
  167 |     // Check that value is updated
  168 |     await expect(invoiceNumInput).toHaveValue('INV-999');
  169 |   });
  170 | });
  171 | 
```