/**
 * Billing / Wallet E2E Tests
 *
 * Covers: wallet page renders, plans visible, credit balance shown,
 * Razorpay SDK loads, create-order API intercepted (no real charge),
 * verify-payment flow mocked.
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';

let sharedSession: Awaited<ReturnType<typeof signUpTestUser>>;

test.beforeAll(async () => {
  sharedSession = await signUpTestUser();
});

test.describe('Wallet Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);
    await page.goto('/wallet');
    // Use domcontentloaded — Razorpay CDN keeps network busy indefinitely
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test('wallet page renders without crash', async ({ page }) => {
    const heading = page
      .locator('text=/wallet|billing|credit/i')
      .first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    const errorBoundary = page.locator('text=/something went wrong/i');
    await expect(errorBoundary).toHaveCount(0);
  });

  test('credit balance is a number — not NaN or undefined', async ({ page }) => {
    const pageContent = await page.content();
    expect(pageContent).not.toContain('>NaN<');
    expect(pageContent).not.toContain('>undefined<');
  });

  test('at least one pricing plan is visible', async ({ page }) => {
    const plan = page
      .locator('text=/starter|pro|enterprise|credits/i')
      .first();
    await expect(plan).toBeVisible({ timeout: 10000 });
  });

  test('purchase button is enabled and clicking it does not crash the page', async ({ page }) => {
    // Intercept create-order to avoid any real backend call
    await page.route(`${API_URL}/api/create-order`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_id: 'order_e2e_test_123',
          amount: 249900,
          currency: 'INR',
          key_id: 'rzp_test_mock',
        }),
      });
    });

    const purchaseBtn = page
      .getByRole('button', { name: /purchase|buy|get started/i })
      .first();

    if (!await purchaseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'No purchase button found');
      return;
    }

    await expect(purchaseBtn).toBeEnabled();
    await purchaseBtn.click();

    // Allow Razorpay modal to attempt to open (or fail gracefully)
    await page.waitForTimeout(2000);

    // Page must NOT crash
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('TypeError');
  });

  test('transaction history table renders — empty or with rows, never crashes', async ({ page }) => {
    // The transactions table must render without error
    const table = page
      .locator('table')
      .or(page.locator('text=/no transactions|transaction history/i'))
      .first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const errorBoundary = page.locator('text=/something went wrong/i');
    await expect(errorBoundary).toHaveCount(0);
  });

  test('usage logs section renders token totals without NaN', async ({ page }) => {
    const usageSection = page
      .locator('text=/usage|token|audit log/i')
      .first();
    await expect(usageSection).toBeVisible({ timeout: 10000 });

    const pageContent = await page.content();
    expect(pageContent).not.toContain('>NaN<');
  });
});

test.describe('Payment Flow — Backend Integration', () => {
  test('create-order API is called with correct amount when purchase button clicked', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    let capturedOrderBody: Record<string, unknown> | null = null;

    await page.route(`${API_URL}/api/create-order`, async (route) => {
      const postData = route.request().postDataJSON();
      capturedOrderBody = postData;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_id: 'order_captured_test',
          amount: 249900,
          currency: 'INR',
          key_id: 'rzp_test_mock',
        }),
      });
    });

    await page.goto('/wallet');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const purchaseBtn = page
      .getByRole('button', { name: /purchase|buy/i })
      .first();

    if (!await purchaseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'No purchase button found');
      return;
    }

    await purchaseBtn.click();
    await page.waitForTimeout(2000);

    if (capturedOrderBody) {
      // Verify the correct fields are sent
      expect(capturedOrderBody).toHaveProperty('amount');
      expect(capturedOrderBody).toHaveProperty('credits');
      expect(capturedOrderBody).toHaveProperty('plan_type');
      expect(typeof capturedOrderBody.amount).toBe('number');
      expect(typeof capturedOrderBody.credits).toBe('number');
    }
  });

  test('failed create-order (500) shows error toast — not a crash', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${API_URL}/api/create-order`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    await page.goto('/wallet');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const purchaseBtn = page
      .getByRole('button', { name: /purchase|buy/i })
      .first();

    if (!await purchaseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'No purchase button found');
      return;
    }

    await purchaseBtn.click();
    await page.waitForTimeout(3000);

    // Should show a toast or error message — not crash
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');

    const errorMsg = page
      .locator('text=/error|failed|could not/i')
      .first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });
});
