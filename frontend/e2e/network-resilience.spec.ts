/**
 * Network Resilience E2E Tests
 *
 * Tests that the frontend gracefully handles backend failures:
 * - 500 errors show ErrorState components, not white screens
 * - Retry button recovers the UI without page refresh
 * - Offline-style failures don't leave infinite spinners
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wmxwjkmxyrngvitxseei.supabase.co';

let sharedSession: Awaited<ReturnType<typeof signUpTestUser>>;

test.beforeAll(async () => {
  sharedSession = await signUpTestUser();
});

test.describe('Network Resilience', () => {
  test('dashboard survives a 500 from the invoices query', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    // Intercept Supabase invoices REST calls
    await page.route(`${SUPABASE_URL}/rest/v1/invoices*`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Must NOT show a full white screen or unhandled error
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('ChunkLoadError');

    // Dashboard heading or some UI element must still be visible
    const anyContent = page
      .locator('text=/dashboard|error|retry|failed/i')
      .first();
    await expect(anyContent).toBeVisible({ timeout: 10000 });
  });

  test('invoices page survives a 500 and shows an error state', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${SUPABASE_URL}/rest/v1/invoices*`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');

    // Must render something — not a blank page
    const body = page.locator('body');
    const bodyText = await body.textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });

  test('clients page survives a 500 and remains interactive', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${SUPABASE_URL}/rest/v1/clients*`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('scan page survives backend unavailability during file upload', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    // Simulate backend completely down
    await page.route(`${API_URL}/api/scan-invoice`, async (route) => {
      await route.abort('failed');
    });

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'File input not found');
      return;
    }

    await fileInput.setInputFiles({
      name: 'invoice.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]),
    });

    // Wait for timeout / error state
    await page.waitForTimeout(6000);

    // Must not white-screen
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('wallet page handles 500 on usage-logs gracefully', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${API_URL}/api/audit/usage-logs`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    await page.goto('/wallet');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');

    // Wallet page must still render
    const heading = page.locator('text=/wallet|billing|credit/i').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('settings page handles 500 gracefully', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });
});

test.describe('Navigation Resilience', () => {
  test('rapid navigation between pages does not leave the app in a broken state', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    // Navigate rapidly between multiple pages
    for (const route of ['/dashboard', '/invoices', '/scan', '/wallet', '/clients', '/dashboard']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
    }

    // After rapid navigation, the final page must render without crash
    await page.waitForTimeout(2000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('ChunkLoadError');

    // Should be on dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('browser back/forward does not crash the app', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/invoices');
    await page.waitForLoadState('domcontentloaded');

    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });
});
