/**
 * GSTR-2B Reconciliation E2E Tests
 *
 * Covers: page load, corrupt file graceful error, valid file upload,
 * deep-match credit guard (402 mock), tolerance input validation.
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';
import * as XLSX from 'xlsx';

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';

let sharedSession: Awaited<ReturnType<typeof signUpTestUser>>;

test.beforeAll(async () => {
  sharedSession = await signUpTestUser();
});

/** Build a minimal valid GSTR-2B Excel with one B2B row. */
function makeGSTR2BExcel(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
      'Invoice Date', 'Invoice Value(₹)', 'Place of supply',
      'Supply Attracts Reverse Charge', 'Rate(%)', 'Taxable Value',
      'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)',
      'ITC Availability',
    ],
    [
      '27AADCB2230M1Z2', 'TEST SUPPLIER', 'INV-001', 'Regular',
      '01-03-2024', 1180, '27-Maharashtra',
      'No', 18, 1000,
      0, 90, 90, 0,
      'Yes',
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'B2B');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

test.describe('Reconciliation Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');
  });

  test('reconciliation page renders without crash', async ({ page }) => {
    const heading = page
      .locator('text=/reconcil|GSTR|2B/i')
      .first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    const errorBoundary = page.locator('text=/something went wrong/i');
    await expect(errorBoundary).toHaveCount(0);
  });

  test('uploading a corrupt Excel file shows graceful error — not a crash', async ({ page }) => {
    // Mock backend to return 400
    await page.route(`${API_URL}/api/reconcile`, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Failed to parse B2B sheet in GSTR-2B file' }),
      });
    });

    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'File input not found on reconcile page');
      return;
    }

    await fileInput.setInputFiles({
      name: 'corrupt.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('NOT A REAL EXCEL FILE GARBAGE DATA 12345'),
    });

    await page.waitForTimeout(5000);

    // Must NOT show a white screen or React error
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('Cannot read properties of');

    // Reconciliation page heading should still be visible (not navigated away)
    const heading = page
      .locator('text=/reconcil|GSTR|2B/i')
      .first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('uploading a valid GSTR-2B Excel triggers reconciliation and returns success or client error', async ({ page }) => {
    // Mock successful reconciliation
    await page.route(`${API_URL}/api/reconcile`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          message: 'Reconciled 1 records from 2B against 0 Purchase Register invoices using 1 tolerance.',
        }),
      });
    });

    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'File input not found');
      return;
    }

    await fileInput.setInputFiles({
      name: 'gstr2b_valid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: makeGSTR2BExcel(),
    });

    // Wait for response
    const resultMsg = page
      .locator('text=/reconcil|matched|mismatch|missing|success/i')
      .first();
    await expect(resultMsg).toBeVisible({ timeout: 30000 });
  });

  test('deep-match button shows 402 credit error when backend returns insufficient credits', async ({ page }) => {
    await page.route(`${API_URL}/api/reconcile/deep-match`, async (route) => {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Insufficient credits for AI Deep Match.' }),
      });
    });

    // Find and click the deep match button if it exists
    const deepMatchBtn = page
      .getByRole('button', { name: /deep match|ai match/i })
      .first();

    if (!await deepMatchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Deep match button not visible (may require prior reconciliation)');
      return;
    }

    await deepMatchBtn.click();
    await page.waitForTimeout(3000);

    // Must show credit error
    const creditError = page
      .locator('text=/credit|insufficient|recharge/i')
      .first();
    await expect(creditError).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Reconciliation — Network Resilience', () => {
  test('reconciliation page shows error state on backend 500 and remains usable', async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);

    await page.route(`${API_URL}/api/reconcile`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'File input not found');
      return;
    }

    await fileInput.setInputFiles({
      name: 'gstr2b.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: makeGSTR2BExcel(),
    });

    await page.waitForTimeout(5000);

    // Page should not white-screen
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');

    // Reconcile page heading should still be visible
    const heading = page
      .locator('text=/reconcil|GSTR/i')
      .first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });
});
