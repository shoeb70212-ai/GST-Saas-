# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bank-statements.spec.ts >> Bank Statements UI & Edge Cases >> Edge Case 3: Missing Context UI Guard
- Location: e2e\bank-statements.spec.ts:60:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h2:has-text("No Client Selected")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('h2:has-text("No Client Selected")')

```

```yaml
- heading "404" [level=1]
- paragraph: The page you're looking for doesn't exist.
- link "Go Home":
  - /url: /
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { signUpTestUser, loginViaSessionInjection, injectActiveClientContext } from './test-helpers';
  3  | 
  4  | let testAccessToken = '';
  5  | 
  6  | test.beforeAll(async () => {
  7  |   const { access_token } = await signUpTestUser();
  8  |   testAccessToken = access_token;
  9  | });
  10 | 
  11 | test.describe('Bank Statements UI & Edge Cases', () => {
  12 |   test.beforeEach(async ({ page }) => {
  13 |     await loginViaSessionInjection(page, testAccessToken);
  14 |   });
  15 | 
  16 |   test('Edge Case 1: Empty Data payload is handled gracefully', async ({ page }) => {
  17 |     await injectActiveClientContext(page, 'test-client-123');
  18 |     
  19 |     // Intercept with empty statements
  20 |     await page.route('**/rest/v1/bank_statements*', async (route) => {
  21 |       await route.fulfill({
  22 |         status: 200,
  23 |         contentType: 'application/json',
  24 |         body: JSON.stringify([])
  25 |       });
  26 |     });
  27 | 
  28 |     await page.goto('/dashboard/bank-statements');
  29 |     await page.waitForLoadState('networkidle');
  30 | 
  31 |     // UI should render without crashing
  32 |     const header = page.locator('h1:has-text("Bank Statements")');
  33 |     await expect(header).toBeVisible();
  34 |     
  35 |     // Page must not have runtime errors
  36 |     const pageContent = await page.content();
  37 |     expect(pageContent).not.toContain('Unhandled Runtime Error');
  38 |   });
  39 | 
  40 |   test('Edge Case 2: Server 500 Error is caught', async ({ page }) => {
  41 |     await injectActiveClientContext(page, 'test-client-123');
  42 |     
  43 |     // Force a 500 error
  44 |     await page.route('**/rest/v1/bank_statements*', async (route) => {
  45 |       await route.fulfill({
  46 |         status: 500,
  47 |         contentType: 'application/json',
  48 |         body: JSON.stringify({ message: 'Internal Server Error' })
  49 |       });
  50 |     });
  51 | 
  52 |     await page.goto('/dashboard/bank-statements');
  53 |     await page.waitForLoadState('networkidle');
  54 | 
  55 |     // Page must not crash
  56 |     const pageContent = await page.content();
  57 |     expect(pageContent).not.toContain('Unhandled Runtime Error');
  58 |   });
  59 | 
  60 |   test('Edge Case 3: Missing Context UI Guard', async ({ page }) => {
  61 |     // DO NOT inject client context
  62 |     await page.goto('/dashboard/bank-statements');
  63 |     await page.waitForLoadState('networkidle');
  64 | 
  65 |     const heading = page.locator('h2:has-text("No Client Selected")');
> 66 |     await expect(heading).toBeVisible();
     |                           ^ Error: expect(locator).toBeVisible() failed
  67 |   });
  68 | });
  69 | 
```