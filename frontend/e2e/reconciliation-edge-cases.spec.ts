import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testAccessToken = '';

test.beforeAll(async ({ browser }) => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
  
  // Create a client
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginViaSessionInjection(page, testAccessToken);
  await page.goto('/clients');
  await page.waitForLoadState('networkidle');
  
  await page.locator('button:has-text("Add")').first().click();
  await page.getByPlaceholder('e.g. Acme Corp').fill('Recon Edge Case Client');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1000);
  await context.close();
});

test.describe('GSTR-2B Reconciliation Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    // Make sure client is selected
    const clientSwitcher = page.locator('button').filter({
      has: page.locator('.lucide-building-2, .lucide-chevron-down'),
    }).first();
    try {
      if (await clientSwitcher.isVisible({ timeout: 2000 })) {
        await clientSwitcher.click();
        await page.waitForTimeout(500);
        const clientButtons = page.locator('.max-h-48 button');
        if (await clientButtons.count() > 0) {
          await clientButtons.first().click({ force: true });
          await page.waitForTimeout(1000);
        }
      }
    } catch (_e) {}
  });

  test('Empty State Handling does not crash', async ({ page }) => {
    // If the purchase register is empty, we should just see 0s for everything
    await expect(page.locator('h3:has-text("Matched")')).toBeVisible();
    await expect(page.locator('h3:has-text("Matched")').locator('xpath=following-sibling::span')).toHaveText('0');
    
    // AI Deep Match button should be disabled when empty
    const deepMatchBtn = page.locator('button:has-text("AI Deep Match")');
    await expect(deepMatchBtn).toBeDisabled();
  });

  test('AI Deep Match Execution with Mock API', async ({ page }) => {
    // Intercept GSTR-2B upload
    await page.route('**/api/reconcile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'GSTR-2B Uploaded & Basic Matching Complete' }),
      });
    });

    // Intercept Deep Match
    await page.route('**/api/reconcile/deep-match', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'AI Deep Match completed successfully. 1 Credit deducted.' }),
      });
    });

    // We need missingIn2B > 0 AND missingInPR > 0 to enable the button.
    await page.route('**/rest/v1/invoices*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: '1', recon_status: 'missing_in_2b', taxable_amount: 100 }]),
      });
    });

    await page.route('**/rest/v1/gstr2b_records*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: '2', supplier_gstin: '29ABCDE1234F1Z5', invoice_number: 'INV-001', taxable_value: 200 }]),
      });
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for the mock data to populate and button to be enabled
    const deepMatchBtn = page.locator('button:has-text("AI Deep Match")');
    await expect(deepMatchBtn).toBeEnabled({ timeout: 10000 });

    // Click it
    await deepMatchBtn.click();

    // Verify success toast appears
    const successToast = page.locator('text=/AI Deep Match completed successfully/i');
    await expect(successToast).toBeVisible({ timeout: 10000 });
  });
});
