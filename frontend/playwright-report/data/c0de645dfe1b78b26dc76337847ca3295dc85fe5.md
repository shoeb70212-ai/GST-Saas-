# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bank-reconcile.spec.ts >> Bank Reconciliation Dashboard Edge Cases >> Edge Case 1: Empty State handling without crashing
- Location: e2e\bank-reconcile.spec.ts:16:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h3:has-text("No Suggestions Found")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('h3:has-text("No Suggestions Found")')

```

```yaml
- heading "404" [level=1]
- paragraph: The page you're looking for doesn't exist.
- link "Go Home":
  - /url: /
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { signUpTestUser, loginViaSessionInjection, injectActiveClientContext } from './test-helpers';
  3   | 
  4   | let testAccessToken = '';
  5   | 
  6   | test.beforeAll(async () => {
  7   |   const { access_token } = await signUpTestUser();
  8   |   testAccessToken = access_token;
  9   | });
  10  | 
  11  | test.describe('Bank Reconciliation Dashboard Edge Cases', () => {
  12  |   test.beforeEach(async ({ page }) => {
  13  |     await loginViaSessionInjection(page, testAccessToken);
  14  |   });
  15  | 
  16  |   test('Edge Case 1: Empty State handling without crashing', async ({ page }) => {
  17  |     await injectActiveClientContext(page, 'test-client-123');
  18  |     
  19  |     // Intercept with an empty array
  20  |     await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
  21  |       await route.fulfill({
  22  |         status: 200,
  23  |         contentType: 'application/json',
  24  |         body: JSON.stringify({ status: 'success', data: [] })
  25  |       });
  26  |     });
  27  | 
  28  |     await page.goto('/dashboard/reconcile');
  29  |     await page.waitForLoadState('networkidle');
  30  | 
  31  |     // Should show Empty State, not a crash
  32  |     const emptyStateHeading = page.locator('h3:has-text("No Suggestions Found")');
> 33  |     await expect(emptyStateHeading).toBeVisible();
      |                                     ^ Error: expect(locator).toBeVisible() failed
  34  |     
  35  |     // Page must not have runtime errors
  36  |     const pageContent = await page.content();
  37  |     expect(pageContent).not.toContain('Unhandled Runtime Error');
  38  |   });
  39  | 
  40  |   test('Edge Case 2: Server 500 Error handles gracefully with Toast', async ({ page }) => {
  41  |     await injectActiveClientContext(page, 'test-client-123');
  42  |     
  43  |     // Force a 500 Internal Server Error
  44  |     await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
  45  |       await route.fulfill({
  46  |         status: 500,
  47  |         contentType: 'application/json',
  48  |         body: JSON.stringify({ detail: 'Database connection failed' })
  49  |       });
  50  |     });
  51  | 
  52  |     await page.goto('/dashboard/reconcile');
  53  |     await page.waitForLoadState('networkidle');
  54  | 
  55  |     // UI should still be functional (no white screen)
  56  |     const pageTitle = page.locator('h1:has-text("Bank Reconciliation")');
  57  |     await expect(pageTitle).toBeVisible();
  58  | 
  59  |     // Verify it doesn't crash on empty
  60  |     const pageContent = await page.content();
  61  |     expect(pageContent).not.toContain('Unhandled Runtime Error');
  62  |   });
  63  | 
  64  |   test('Happy Path & Edge Case 3: Network Latency on Engine Run', async ({ page }) => {
  65  |     await injectActiveClientContext(page, 'test-client-123');
  66  |     
  67  |     // 1. Initial Load: Return 1 match
  68  |     await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
  69  |       await route.fulfill({
  70  |         status: 200,
  71  |         contentType: 'application/json',
  72  |         body: JSON.stringify({
  73  |           status: 'success',
  74  |           data: [
  75  |             {
  76  |               id: 'match_123',
  77  |               invoice_id: 'inv_abc',
  78  |               bank_transaction_id: 'txn_xyz',
  79  |               match_type: 'EXACT',
  80  |               allocated_amount: 1000.50,
  81  |               status: 'SUGGESTED',
  82  |               created_by: 'AI',
  83  |               invoices: { supplier_name: 'Test Supplier', total_amount: 1000.50 },
  84  |               bank_transactions: { txn_date: '2026-05-15', description: 'NEFT Test', withdrawal: 1000.50 }
  85  |             }
  86  |           ]
  87  |         })
  88  |       });
  89  |     });
  90  | 
  91  |     // 2. Engine Run Route (Slow response to test loading spinner)
  92  |     await page.route('**/api/bank-reconcile/run', async (route) => {
  93  |       // Simulate 2s delay
  94  |       await new Promise(r => setTimeout(r, 2000));
  95  |       await route.fulfill({
  96  |         status: 200,
  97  |         contentType: 'application/json',
  98  |         body: JSON.stringify({ status: 'success', message: 'Engine run complete.' })
  99  |       });
  100 |     });
  101 | 
  102 |     await page.goto('/dashboard/reconcile');
  103 |     await page.waitForLoadState('networkidle');
  104 | 
  105 |     // Verify Match renders
  106 |     await expect(page.locator('text=/Test Supplier/i').first()).toBeVisible();
  107 | 
  108 |     // Run Engine
  109 |     const runBtn = page.locator('button:has-text("Run AI Match Engine")');
  110 |     await runBtn.click();
  111 | 
  112 |     // Verify Spinner renders while waiting
  113 |     await expect(page.locator('button:has-text("Running Engine...")')).toBeVisible();
  114 |     await expect(runBtn).toBeDisabled(); // Button must be disabled to prevent double-click
  115 | 
  116 |     // Wait for the simulated delay to finish
  117 |     await expect(runBtn).toBeEnabled({ timeout: 5000 });
  118 |   });
  119 | 
  120 |   test('Edge Case 4: Context Dropping (No Client)', async ({ page }) => {
  121 |     // DO NOT inject client context
  122 |     await page.goto('/dashboard/reconcile');
  123 |     await page.waitForLoadState('networkidle');
  124 | 
  125 |     // Should gracefully show the "No Client Selected" warning
  126 |     const heading = page.locator('h2:has-text("No Client Selected")');
  127 |     await expect(heading).toBeVisible();
  128 |   });
  129 | });
  130 | 
```