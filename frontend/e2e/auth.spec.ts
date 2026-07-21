/**
 * Auth E2E Tests
 *
 * Tests that Playwright itself can run — basic smoke tests for public pages.
 * These do NOT require a running backend.
 */
import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test('landing page loads and shows sign in link', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/KhataLens/i);

    // Some form of sign-in CTA must be present on the landing page
    const signInLink = page
      .getByRole('link', { name: /sign in/i })
      .or(page.getByRole('button', { name: /sign in/i }))
      .or(page.getByText(/get started/i))
      .first();

    await expect(signInLink).toBeVisible({ timeout: 10000 });
  });

  test('auth page renders login form', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('domcontentloaded');

    // Email input must exist
    const emailInput = page
      .getByPlaceholder(/email/i)
      .or(page.locator('input[type="email"]'))
      .first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });

    // Password input must exist
    const passwordInput = page
      .getByPlaceholder(/password/i)
      .or(page.locator('input[type="password"]'))
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
  });

  test('navigating to /auth when already on /auth does not crash', async ({ page }) => {
    await page.goto('/auth');
    await page.goto('/auth');
    await page.waitForLoadState('domcontentloaded');

    // Must still show the login form, not a blank/error screen
    const emailInput = page
      .getByPlaceholder(/email/i)
      .or(page.locator('input[type="email"]'))
      .first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test('404 page shown for completely unknown route', async ({ page }) => {
    await page.goto('/this-route-absolutely-does-not-exist-xyz');
    await page.waitForLoadState('domcontentloaded');

    // Must show 404, not a white screen or React error
    const notFoundText = page
      .locator('text=/404|not found|page.*not.*exist/i')
      .first();
    await expect(notFoundText).toBeVisible({ timeout: 10000 });
  });
});
