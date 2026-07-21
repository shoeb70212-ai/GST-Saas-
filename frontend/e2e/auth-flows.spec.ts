/**
 * Authentication Flow E2E Tests
 *
 * Tests the full login/logout cycle.
 * Uses session injection for speed — only the UI login test uses the actual form.
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection, clearSession } from './test-helpers';

test.describe('Auth Flows', () => {
  test('unauthenticated user visiting /dashboard is redirected to /auth', async ({ page }) => {
    await clearSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });

    // Auth form must be visible (not a white screen)
    const emailInput = page
      .getByPlaceholder(/email/i)
      .or(page.locator('input[type="email"]'))
      .first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated user visiting /invoices is redirected to /auth', async ({ page }) => {
    await clearSession(page);
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('unauthenticated user visiting /wallet is redirected to /auth', async ({ page }) => {
    await clearSession(page);
    await page.goto('/wallet');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('unauthenticated user visiting /scan is redirected to /auth', async ({ page }) => {
    await clearSession(page);
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('unauthenticated user visiting /settings is redirected to /auth', async ({ page }) => {
    await clearSession(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('authenticated user visiting /auth is redirected to /dashboard', async ({ page }) => {
    const session = await signUpTestUser();
    await loginViaSessionInjection(page, session);

    // Now try to go back to /auth — should redirect away
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('authenticated user can reach dashboard without redirect', async ({ page }) => {
    const session = await signUpTestUser();
    await loginViaSessionInjection(page, session);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Should NOT be on /auth
    expect(page.url()).not.toContain('/auth');
  });

  test('sign out clears session and redirects away from protected routes', async ({ page }) => {
    const session = await signUpTestUser();
    await loginViaSessionInjection(page, session);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Click Sign Out button
    const signOutBtn = page
      .getByRole('button', { name: /sign out/i })
      .first();

    // Sign out may be in sidebar or mobile menu
    if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signOutBtn.click();
    } else {
      // Try the mobile "More" menu
      const moreBtn = page.locator('button').filter({ hasText: /more/i }).first();
      if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await moreBtn.click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: /sign out/i }).first().click();
      }
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // After sign-out, going to /dashboard should redirect to /auth
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });
});
