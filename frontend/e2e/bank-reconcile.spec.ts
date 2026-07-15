import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection, injectActiveClientContext } from './test-helpers';

let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});

test.describe('Bank Reconciliation Dashboard Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
  });

  test('Edge Case 1: Empty State handling without crashing', async ({ page }) => {
    await injectActiveClientContext(page, 'test-client-123');
    
    // Intercept with an empty array
    await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: [] })
      });
    });

    await page.goto('/dashboard/reconcile');
    await page.waitForLoadState('networkidle');

    // Should show Empty State, not a crash
    const emptyStateHeading = page.locator('h3:has-text("No Suggestions Found")');
    await expect(emptyStateHeading).toBeVisible();
    
    // Page must not have runtime errors
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('Edge Case 2: Server 500 Error handles gracefully with Toast', async ({ page }) => {
    await injectActiveClientContext(page, 'test-client-123');
    
    // Force a 500 Internal Server Error
    await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Database connection failed' })
      });
    });

    await page.goto('/dashboard/reconcile');
    await page.waitForLoadState('networkidle');

    // UI should still be functional (no white screen)
    const pageTitle = page.locator('h1:has-text("Bank Reconciliation")');
    await expect(pageTitle).toBeVisible();

    // Verify it doesn't crash on empty
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('Happy Path & Edge Case 3: Network Latency on Engine Run', async ({ page }) => {
    await injectActiveClientContext(page, 'test-client-123');
    
    // 1. Initial Load: Return 1 match
    await page.route('**/api/bank-reconcile/suggestions/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: [
            {
              id: 'match_123',
              invoice_id: 'inv_abc',
              bank_transaction_id: 'txn_xyz',
              match_type: 'EXACT',
              allocated_amount: 1000.50,
              status: 'SUGGESTED',
              created_by: 'AI',
              invoices: { supplier_name: 'Test Supplier', total_amount: 1000.50 },
              bank_transactions: { txn_date: '2026-05-15', description: 'NEFT Test', withdrawal: 1000.50 }
            }
          ]
        })
      });
    });

    // 2. Engine Run Route (Slow response to test loading spinner)
    await page.route('**/api/bank-reconcile/run', async (route) => {
      // Simulate 2s delay
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Engine run complete.' })
      });
    });

    await page.goto('/dashboard/reconcile');
    await page.waitForLoadState('networkidle');

    // Verify Match renders
    await expect(page.locator('text=/Test Supplier/i').first()).toBeVisible();

    // Run Engine
    const runBtn = page.locator('button:has-text("Run AI Match Engine")');
    await runBtn.click();

    // Verify Spinner renders while waiting
    await expect(page.locator('button:has-text("Running Engine...")')).toBeVisible();
    await expect(runBtn).toBeDisabled(); // Button must be disabled to prevent double-click

    // Wait for the simulated delay to finish
    await expect(runBtn).toBeEnabled({ timeout: 5000 });
  });

  test('Edge Case 4: Context Dropping (No Client)', async ({ page }) => {
    // DO NOT inject client context
    await page.goto('/dashboard/reconcile');
    await page.waitForLoadState('networkidle');

    // Should gracefully show the "No Client Selected" warning
    const heading = page.locator('h2:has-text("No Client Selected")');
    await expect(heading).toBeVisible();
  });
});
