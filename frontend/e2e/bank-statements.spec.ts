import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection, injectActiveClientContext } from './test-helpers';

let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});

test.describe('Bank Statements UI & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
  });

  test('Edge Case 1: Empty Data payload is handled gracefully', async ({ page }) => {
    await injectActiveClientContext(page, 'test-client-123');
    
    // Intercept with empty statements
    await page.route('**/rest/v1/bank_statements*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.goto('/dashboard/bank-statements');
    await page.waitForLoadState('networkidle');

    // UI should render without crashing
    const header = page.locator('h1:has-text("Bank Statements")');
    await expect(header).toBeVisible();
    
    // Page must not have runtime errors
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('Edge Case 2: Server 500 Error is caught', async ({ page }) => {
    await injectActiveClientContext(page, 'test-client-123');
    
    // Force a 500 error
    await page.route('**/rest/v1/bank_statements*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' })
      });
    });

    await page.goto('/dashboard/bank-statements');
    await page.waitForLoadState('networkidle');

    // Page must not crash
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('Edge Case 3: Missing Context UI Guard', async ({ page }) => {
    // DO NOT inject client context
    await page.goto('/dashboard/bank-statements');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h2:has-text("No Client Selected")');
    await expect(heading).toBeVisible();
  });
});
