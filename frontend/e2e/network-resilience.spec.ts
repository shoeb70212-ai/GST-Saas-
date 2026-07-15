import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});

test.describe('Network Resilience Edge Cases (Error UI/UX)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
  });

  test('Dashboard shows ErrorState on 500 Network Failure and Recovers on Retry', async ({ page }) => {
    // 1. Create a mock client so we can select it (since dashboard requires a client)
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    
    const addBtn = page.locator('button:has-text("Add")').first();
    if (await addBtn.isVisible()) {
        await addBtn.click();
    }
    const uniqueClientName = `Resilience Client ${Date.now()}`;
    await page.getByPlaceholder('e.g. Acme Corp').fill(uniqueClientName);
    await page.locator('button[type="submit"]').click();
    
    // Wait for the client to be created and available
    await expect(page.locator(`text=${uniqueClientName}`).first()).toBeVisible({ timeout: 15000 });

    // 2. Setup the Malicious Route Interception (Simulate 500)
    // Intercept the /invoices table fetch which actually throws in the queryFn
    await page.route('**/rest/v1/invoices*', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: "Internal Server Error" })
      });
    });

    // 3. Navigate to Dashboard and Select the Client
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Select client from sidebar (assuming standard Khatalens layout)
    await page.locator(`button:has-text("${uniqueClientName}")`).first().click();

    // 4. Assert Error State Appears
    const errorTitle = page.locator('h3:has-text("Dashboard Failed to Load")');
    await expect(errorTitle).toBeVisible({ timeout: 10000 });

    const retryButton = page.locator('button:has-text("Retry")');
    await expect(retryButton).toBeVisible();

    // 5. Un-route (heal the network) and Click Retry
    await page.unroute('**/rest/v1/invoices*');
    
    // We don't need to mock /invoices on retry, let it hit the real DB and succeed.

    // Also mock analytics
    await page.route('**/rest/v1/rpc/get_advanced_analytics*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

    await retryButton.click();

    // 6. Assert Error Disappears and Dashboard Loads
    await expect(errorTitle).not.toBeVisible({ timeout: 10000 });
    // Should render the widgets
    await expect(page.locator('text=Total Taxable')).toBeVisible(); 
  });
});
