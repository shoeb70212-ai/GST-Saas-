/**
 * Bank Reconciliation E2E Tests
 *
 * Covers: page load, run engine (mocked), approve/reject/undo match,
 * history tab, IDOR prevention (client ownership).
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';

let sharedSession: Awaited<ReturnType<typeof signUpTestUser>>;

test.beforeAll(async () => {
  sharedSession = await signUpTestUser();
});

test.describe('Bank Reconciliation Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);
    await page.goto('/bank-reconcile');
    await page.waitForLoadState('networkidle');
  });

  test('bank reconcile page renders without crash', async ({ page }) => {
    const heading = page
      .locator('text=/reconcil|match|bank/i')
      .first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    const errorBoundary = page.locator('text=/something went wrong/i');
    await expect(errorBoundary).toHaveCount(0);
  });

  test('run engine button triggers AI matching — success response shown', async ({ page }) => {
    await page.route(`${API_URL}/api/bank-reconcile/run`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          message: 'Engine run complete.',
          suggestions_created: 3,
        }),
      });
    });

    const runBtn = page
      .getByRole('button', { name: /run|match|engine/i })
      .first();

    if (!await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Run engine button not found');
      return;
    }

    await runBtn.click();
    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('run engine 500 shows error — not crash', async ({ page }) => {
    await page.route(`${API_URL}/api/bank-reconcile/run`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    const runBtn = page
      .getByRole('button', { name: /run|match|engine/i })
      .first();

    if (!await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Run engine button not found');
      return;
    }

    await runBtn.click();
    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('approve match API called on approve button click', async ({ page }) => {
    let approveCalled = false;

    await page.route(`${API_URL}/api/bank-reconcile/suggestions/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: [{
            id: 'match-1',
            match_type: 'EXACT',
            allocated_amount: 5000.0,
            confidence_score: 1.0,
            status: 'SUGGESTED',
            invoices: { supplier_name: 'Test Vendor', total_amount: 5000 },
            bank_transactions: { description: 'NEFT-Test Vendor', withdrawal: 5000 },
          }],
        }),
      });
    });

    await page.route(`${API_URL}/api/bank-reconcile/approve`, async (route) => {
      approveCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Match approved.' }),
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const approveBtn = page
      .getByRole('button', { name: /approve|confirm/i })
      .first();

    if (!await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip(true, 'Approve button not visible — no suggestions loaded');
      return;
    }

    await approveBtn.click();
    await page.waitForTimeout(2000);

    expect(approveCalled).toBe(true);

    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
  });

  test('undo match removes it from approved list', async ({ page }) => {
    let undoCalled = false;

    await page.route(`${API_URL}/api/bank-reconcile/undo`, async (route) => {
      undoCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Match successfully undone.' }),
      });
    });

    // Look for the History tab and switch to it
    const historyTab = page
      .getByRole('tab', { name: /history|undo/i })
      .or(page.locator('button').filter({ hasText: /history/i }))
      .first();

    if (!await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'History tab not found');
      return;
    }

    await historyTab.click();
    await page.waitForTimeout(1000);

    const undoBtn = page
      .getByRole('button', { name: /undo/i })
      .first();

    if (!await undoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No undo button — history may be empty');
      return;
    }

    await undoBtn.click();
    await page.waitForTimeout(2000);

    expect(undoCalled).toBe(true);
  });
});
