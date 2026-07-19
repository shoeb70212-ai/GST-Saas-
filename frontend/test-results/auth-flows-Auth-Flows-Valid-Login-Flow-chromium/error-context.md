# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-flows.spec.ts >> Auth Flows >> Valid Login Flow
- Location: e2e\auth-flows.spec.ts:8:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByPlaceholder('Enter your email')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - img [ref=e8]
      - generic [ref=e13]: KhataLens
    - button "Select Client" [ref=e15]:
      - generic [ref=e16]:
        - img [ref=e18]
        - generic [ref=e22]: Select Client
      - img [ref=e23]
    - generic [ref=e25]: Menu
    - navigation [ref=e26]:
      - link "Dashboard" [ref=e27] [cursor=pointer]:
        - /url: /dashboard
        - img [ref=e29]
        - generic [ref=e34]: Dashboard
      - link "Scan" [ref=e35] [cursor=pointer]:
        - /url: /scan
        - img [ref=e36]
        - generic [ref=e41]: Scan
      - link "Invoices" [ref=e42] [cursor=pointer]:
        - /url: /invoices
        - img [ref=e43]
        - generic [ref=e46]: Invoices
      - link "Tax Liability" [ref=e47] [cursor=pointer]:
        - /url: /tax-liability
        - img [ref=e48]
        - generic [ref=e51]: Tax Liability
      - link "Virtual CFO" [ref=e52] [cursor=pointer]:
        - /url: /cfo
        - img [ref=e53]
        - generic [ref=e56]: Virtual CFO
      - link "GSTR-2B" [ref=e57] [cursor=pointer]:
        - /url: /reconcile
        - img [ref=e58]
        - generic [ref=e61]: GSTR-2B
      - link "Bank Stmts" [ref=e62] [cursor=pointer]:
        - /url: /bank-statements
        - img [ref=e63]
        - generic [ref=e66]: Bank Stmts
      - link "Bank Match" [ref=e67] [cursor=pointer]:
        - /url: /bank-reconcile
        - img [ref=e68]
        - generic [ref=e73]: Bank Match
      - link "Clients" [ref=e74] [cursor=pointer]:
        - /url: /clients
        - img [ref=e75]
        - generic [ref=e79]: Clients
      - link "Audit Logs" [ref=e80] [cursor=pointer]:
        - /url: /audit-logs
        - img [ref=e81]
        - generic [ref=e83]: Audit Logs
      - link "Wallet & Billing" [ref=e84] [cursor=pointer]:
        - /url: /wallet
        - img [ref=e85]
        - generic [ref=e87]: Wallet & Billing
      - link "Settings" [ref=e88] [cursor=pointer]:
        - /url: /settings
        - img [ref=e89]
        - generic [ref=e92]: Settings
    - button "Sign Out" [ref=e94]:
      - img [ref=e95]
      - text: Sign Out
  - generic [ref=e98]:
    - generic [ref=e100]:
      - link "Quick Scan" [ref=e101] [cursor=pointer]:
        - /url: /scan
        - img [ref=e102]
        - text: Quick Scan
      - button "Toggle Theme" [ref=e107]:
        - img [ref=e108]
      - generic [ref=e110] [cursor=pointer]: ME
    - generic [ref=e113]:
      - img [ref=e115]
      - heading "Welcome to KhataLens" [level=2] [ref=e119]
      - paragraph [ref=e120]: How will you be using KhataLens? Choose your account type to set up your workspace.
      - generic [ref=e121]:
        - button "Accounting Firm (CA) I manage invoices, bank statements, and GST reconciliation for multiple clients. Set up clients" [ref=e122]:
          - img [ref=e124]
          - heading "Accounting Firm (CA)" [level=3] [ref=e128]
          - paragraph [ref=e129]: I manage invoices, bank statements, and GST reconciliation for multiple clients.
          - generic [ref=e130]:
            - text: Set up clients
            - img [ref=e131]
        - button "Single Business I only need to manage invoices and reconciliation for my own company. Create workspace" [ref=e133]:
          - img [ref=e135]
          - heading "Single Business" [level=3] [ref=e138]
          - paragraph [ref=e139]: I only need to manage invoices and reconciliation for my own company.
          - generic [ref=e140]:
            - text: Create workspace
            - img [ref=e141]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
  3  | 
  4  | let testEmail = `auth-test-${Date.now()}@khatalens.com`;
  5  | const TEST_PASSWORD = 'E2eTest!Secure#2026';
  6  | 
  7  | test.describe('Auth Flows', () => {
  8  |   test('Valid Login Flow', async ({ page }) => {
  9  |     // First sign up a user so they exist
  10 |     // We do this by calling the auth API, because we are testing the UI login
  11 |     await fetch(`${process.env.VITE_SUPABASE_URL || 'https://wmxwjkmxyrngvitxseei.supabase.co'}/auth/v1/signup`, {
  12 |       method: 'POST',
  13 |       headers: {
  14 |         'apikey': process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHdqa214eXJuZ3ZpdHhzZWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTY0NzQsImV4cCI6MjA5ODI5MjQ3NH0.DyuLxMV5ydyRNK_tLESPX6HT-H8ZHrF61FLzDiYs7As',
  15 |         'Content-Type': 'application/json',
  16 |       },
  17 |       body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
  18 |     });
  19 | 
  20 |     await page.goto('/auth');
  21 |     await page.waitForLoadState('networkidle');
  22 | 
  23 |     // Make sure we are on sign in tab
  24 |     await page.getByRole('button', { name: /Sign In/i }).click();
  25 | 
  26 |     // Fill the login form
> 27 |     await page.getByPlaceholder('Enter your email').fill(testEmail);
     |                                                     ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  28 |     await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
  29 | 
  30 |     // Submit
  31 |     await page.locator('button[type="submit"]').click();
  32 | 
  33 |     // Verify redirect to dashboard
  34 |     await expect(page).toHaveURL(/\/dashboard/);
  35 |     await expect(page.locator('text=/Welcome to KhataLens/i')).toBeVisible({ timeout: 15000 });
  36 |   });
  37 | 
  38 |   test('Valid Logout Flow', async ({ page }) => {
  39 |     // We can inject session for speed, then test the UI logout button
  40 |     const { access_token } = await signUpTestUser();
  41 |     await loginViaSessionInjection(page, access_token);
  42 |     
  43 |     // We should be on dashboard now
  44 |     await expect(page).toHaveURL(/\/dashboard/);
  45 |     
  46 |     // Click Sign Out
  47 |     await page.getByRole('button', { name: /Sign Out/i }).click();
  48 | 
  49 |     // Verify we are redirected to landing page or auth
  50 |     await expect(page).toHaveURL(/.*\/(auth)?$/);
  51 |     
  52 |     // Verify session is cleared (trying to visit dashboard redirects to auth)
  53 |     await page.goto('/dashboard');
  54 |     await expect(page).toHaveURL(/\/auth/);
  55 |   });
  56 | });
  57 | 
```