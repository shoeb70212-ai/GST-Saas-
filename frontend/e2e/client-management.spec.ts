import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});

test.describe('Client Management Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
  });

  test('Form Validation prevents empty submission', async ({ page }) => {
    // Click add client button (could be "Add Client" or "Add Your First Client")
    await page.locator('button:has-text("Add")').first().click();

    // Ensure the input field for name is empty
    const nameInput = page.getByPlaceholder('e.g. Acme Corp');
    await nameInput.fill('');

    // Try to submit
    await page.locator('button[type="submit"]').click();

    // Since it's a required field, HTML5 validation will likely block it,
    // OR we will see a toast error.
    // The easiest way to verify is to check that we are still in adding mode.
    await expect(nameInput).toBeVisible();

    // Check if the input is flagged as invalid using pseudo class
    const isInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });

  test('Client Creation succeeds with valid data', async ({ page }) => {
    await page.locator('button:has-text("Add")').first().click();

    const uniqueClientName = `Unique Client ${Date.now()}`;
    await page.getByPlaceholder('e.g. Acme Corp').fill(uniqueClientName);
    
    // Fill optional fields
    await page.getByPlaceholder('29XXXXX1234X1X1').fill('29ABCDE1234F1Z5');
    
    // Submit
    await page.locator('button[type="submit"]').click();

    // Wait for the success toast
    const successToast = page.locator('text=/added successfully/i');
    await expect(successToast).toBeVisible({ timeout: 10000 });

    // Ensure the new client appears in the list (or card grid)
    const newClientCard = page.locator(`h3:has-text("${uniqueClientName}")`);
    await expect(newClientCard).toBeVisible();
  });
});
