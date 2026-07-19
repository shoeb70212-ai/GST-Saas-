# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reconciliation-edge-cases.spec.ts >> GSTR-2B Reconciliation Edge Cases >> Empty State Handling does not crash
- Location: e2e\reconciliation-edge-cases.spec.ts:52:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h3:has-text("Matched")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('h3:has-text("Matched")')

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
- heading "GSTR-2B Reconciliation" [level=1]
- paragraph: Upload government GSTR-2B Excel to instantly match Purchase ITC.
- textbox: 2024-03
- text: "Tolerance: ₹"
- spinbutton "Allowed discrepancy amount": "1"
- button "Choose File"
- button "Upload GSTR-2B"
- button "✨ AI Deep Match (1 Credit)" [disabled]
- heading "No Client Selected" [level=2]
- paragraph: Please select a client from the sidebar to view and run GSTR-2B reconciliation.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
  3   | import path from 'path';
  4   | import { fileURLToPath } from 'url';
  5   | 
  6   | const __filename = fileURLToPath(import.meta.url);
  7   | const __dirname = path.dirname(__filename);
  8   | 
  9   | let testAccessToken = '';
  10  | 
  11  | test.beforeAll(async ({ browser }) => {
  12  |   const { access_token } = await signUpTestUser();
  13  |   testAccessToken = access_token;
  14  |   
  15  |   // Create a client
  16  |   const context = await browser.newContext();
  17  |   const page = await context.newPage();
  18  |   await loginViaSessionInjection(page, testAccessToken);
  19  |   await page.goto('/clients');
  20  |   await page.waitForLoadState('networkidle');
  21  |   
  22  |   await page.locator('button:has-text("Add")').first().click();
  23  |   await page.getByPlaceholder('e.g. Acme Corp').fill('Recon Edge Case Client');
  24  |   await page.locator('button[type="submit"]').click();
  25  |   await page.waitForTimeout(1000);
  26  |   await context.close();
  27  | });
  28  | 
  29  | test.describe('GSTR-2B Reconciliation Edge Cases', () => {
  30  |   test.beforeEach(async ({ page }) => {
  31  |     await loginViaSessionInjection(page, testAccessToken);
  32  |     await page.goto('/reconcile');
  33  |     await page.waitForLoadState('networkidle');
  34  | 
  35  |     // Make sure client is selected
  36  |     const clientSwitcher = page.locator('button').filter({
  37  |       has: page.locator('.lucide-building-2, .lucide-chevron-down'),
  38  |     }).first();
  39  |     try {
  40  |       if (await clientSwitcher.isVisible({ timeout: 2000 })) {
  41  |         await clientSwitcher.click();
  42  |         await page.waitForTimeout(500);
  43  |         const clientButtons = page.locator('.max-h-48 button');
  44  |         if (await clientButtons.count() > 0) {
  45  |           await clientButtons.first().click({ force: true });
  46  |           await page.waitForTimeout(1000);
  47  |         }
  48  |       }
  49  |     } catch (_e) {}
  50  |   });
  51  | 
  52  |   test('Empty State Handling does not crash', async ({ page }) => {
  53  |     // If the purchase register is empty, we should just see 0s for everything
> 54  |     await expect(page.locator('h3:has-text("Matched")')).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  55  |     await expect(page.locator('h3:has-text("Matched")').locator('xpath=following-sibling::span')).toHaveText('0');
  56  |     
  57  |     // AI Deep Match button should be disabled when empty
  58  |     const deepMatchBtn = page.locator('button:has-text("AI Deep Match")');
  59  |     await expect(deepMatchBtn).toBeDisabled();
  60  |   });
  61  | 
  62  |   test('AI Deep Match Execution with Mock API', async ({ page }) => {
  63  |     // Intercept GSTR-2B upload
  64  |     await page.route('**/api/reconcile', async (route) => {
  65  |       await route.fulfill({
  66  |         status: 200,
  67  |         contentType: 'application/json',
  68  |         body: JSON.stringify({ message: 'GSTR-2B Uploaded & Basic Matching Complete' }),
  69  |       });
  70  |     });
  71  | 
  72  |     // Intercept Deep Match
  73  |     await page.route('**/api/reconcile/deep-match', async (route) => {
  74  |       await route.fulfill({
  75  |         status: 200,
  76  |         contentType: 'application/json',
  77  |         body: JSON.stringify({ message: 'AI Deep Match completed successfully. 1 Credit deducted.' }),
  78  |       });
  79  |     });
  80  | 
  81  |     // We need missingIn2B > 0 AND missingInPR > 0 to enable the button.
  82  |     await page.route('**/rest/v1/invoices*', async (route) => {
  83  |       await route.fulfill({
  84  |         status: 200,
  85  |         contentType: 'application/json',
  86  |         body: JSON.stringify([{ id: '1', recon_status: 'missing_in_2b', taxable_amount: 100 }]),
  87  |       });
  88  |     });
  89  | 
  90  |     await page.route('**/rest/v1/gstr2b_records*', async (route) => {
  91  |       await route.fulfill({
  92  |         status: 200,
  93  |         contentType: 'application/json',
  94  |         body: JSON.stringify([{ id: '2', supplier_gstin: '29ABCDE1234F1Z5', invoice_number: 'INV-001', taxable_value: 200 }]),
  95  |       });
  96  |     });
  97  |     
  98  |     await page.reload();
  99  |     await page.waitForLoadState('networkidle');
  100 | 
  101 |     // Wait for the mock data to populate and button to be enabled
  102 |     const deepMatchBtn = page.locator('button:has-text("AI Deep Match")');
  103 |     await expect(deepMatchBtn).toBeEnabled({ timeout: 10000 });
  104 | 
  105 |     // Click it
  106 |     await deepMatchBtn.click();
  107 | 
  108 |     // Verify success toast appears
  109 |     const successToast = page.locator('text=/AI Deep Match completed successfully/i');
  110 |     await expect(successToast).toBeVisible({ timeout: 10000 });
  111 |   });
  112 | });
  113 | 
```