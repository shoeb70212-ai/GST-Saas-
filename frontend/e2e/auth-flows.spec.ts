import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

let testEmail = `auth-test-${Date.now()}@khatalens.com`;
const TEST_PASSWORD = 'E2eTest!Secure#2026';

test.describe('Auth Flows', () => {
  test('Valid Login Flow', async ({ page }) => {
    // First sign up a user so they exist
    // We do this by calling the auth API, because we are testing the UI login
    await fetch(`${process.env.VITE_SUPABASE_URL || 'https://wmxwjkmxyrngvitxseei.supabase.co'}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHdqa214eXJuZ3ZpdHhzZWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTY0NzQsImV4cCI6MjA5ODI5MjQ3NH0.DyuLxMV5ydyRNK_tLESPX6HT-H8ZHrF61FLzDiYs7As',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
    });

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Make sure we are on sign in tab
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Fill the login form
    await page.getByPlaceholder('Enter your email').fill(testEmail);
    await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('text=/Welcome to KhataLens/i')).toBeVisible({ timeout: 15000 });
  });

  test('Valid Logout Flow', async ({ page }) => {
    // We can inject session for speed, then test the UI logout button
    const { access_token } = await signUpTestUser();
    await loginViaSessionInjection(page, access_token);
    
    // We should be on dashboard now
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Click Sign Out
    await page.getByRole('button', { name: /Sign Out/i }).click();

    // Verify we are redirected to landing page or auth
    await expect(page).toHaveURL(/.*\/(auth)?$/);
    
    // Verify session is cleared (trying to visit dashboard redirects to auth)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });
});
