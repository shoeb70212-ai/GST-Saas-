import { test, expect } from '@playwright/test';

test('landing page loads and has login button', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/KhataLens/i);
  const loginButton = page.getByRole('link', { name: /login/i });
  await expect(loginButton).toBeVisible();
});

test('auth page shows login form', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: /Sign in to KhataLens/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});
