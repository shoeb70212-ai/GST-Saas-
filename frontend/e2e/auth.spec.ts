import { test, expect } from '@playwright/test';

test('landing page loads and has login button', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/KhataLens/i);
  const loginButton = page.getByRole('link', { name: /sign in/i });
  await expect(loginButton).toBeVisible();
});

test('auth page shows login form', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
  await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  await expect(page.getByPlaceholder(/password/i)).toBeVisible();
});
