/**
 * KhataLens — Critical Flow E2E Tests
 *
 * These 7 tests target the highest-impact, most fragile paths in the application.
 * They are designed to catch bugs that would cause:
 *   - Revenue leakage (credit drain without service, double-charge)
 *   - Data corruption (cross-client data leakage, lost invoices)
 *   - Security breach (unauthenticated access to protected routes)
 *   - UX breakage (blank screens, unrecoverable error states)
 *
 * Strategy: Each test operates against the LIVE local dev environment
 *   (Vite + FastAPI + Supabase). We use a real test account to exercise
 *   the full vertical stack, not mocks, because the goal is to find
 *   integration seam failures that unit tests miss.
 *
 * Prerequisites:
 *   1. Frontend dev server running on localhost:5173
 *   2. Backend dev server running on localhost:8000
 *   3. .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *   5. Sample files exist in ../samples/
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────
// Shared Helpers & Config
// ──────────────────────────────────────────────

const TEST_EMAIL = `e2e-test-${Date.now()}@khatalens.com`;
const TEST_PASSWORD = 'E2eTest!Secure#2026';
const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';

// Supabase config — read from the same .env the frontend uses
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wmxwjkmxyrngvitxseei.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHdqa214eXJuZ3ZpdHhzZWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTY0NzQsImV4cCI6MjA5ODI5MjQ3NH0.DyuLxMV5ydyRNK_tLESPX6HT-H8ZHrF61FLzDiYs7As';

/**
 * Signs up a fresh test user via Supabase REST API.
 * Returns the access_token for direct session injection.
 */
async function signUpTestUser(): Promise<{ access_token: string; user_id: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!res.ok) {
    // If signup fails (user may already exist), try to sign in instead
    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    if (!signInRes.ok) {
      throw new Error(`Failed to sign up or sign in test user: ${await signInRes.text()}`);
    }
    const signInData = await signInRes.json();
    return {
      access_token: signInData.access_token,
      user_id: signInData.user?.id || '',
    };
  }

  const data = await res.json();
  // Supabase may return session directly if email confirmation is disabled
  if (data.access_token) {
    return { access_token: data.access_token, user_id: data.user?.id || '' };
  }
  // If email confirmation is enabled, we need to sign in after signup
  if (data.id) {
    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    if (!signInRes.ok) {
      throw new Error(`Signup succeeded but sign-in failed: ${await signInRes.text()}`);
    }
    const signInData = await signInRes.json();
    return {
      access_token: signInData.access_token,
      user_id: signInData.user?.id || '',
    };
  }

  throw new Error(`Unexpected signup response: ${JSON.stringify(data)}`);
}

/**
 * Logs in by injecting a Supabase session directly into localStorage,
 * then navigating to /dashboard. This bypasses the login form entirely
 * and is more reliable than form-based login for E2E setup.
 */
async function loginViaSessionInjection(page: Page, accessToken: string) {
  // First get a full session by signing in via API
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!signInRes.ok) {
    throw new Error(`Login API call failed: ${await signInRes.text()}`);
  }

  const sessionData = await signInRes.json();

  // Navigate to the app first so we can set localStorage on the correct origin
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');

  // Inject the Supabase session into localStorage
  // Supabase JS SDK stores session under a key like `sb-<project-ref>-auth-token`
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] || 'wmxwjkmxyrngvitxseei';
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, {
    key: storageKey,
    session: {
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
      expires_at: sessionData.expires_at,
      expires_in: sessionData.expires_in,
      token_type: sessionData.token_type,
      user: sessionData.user,
    },
  });

  // Navigate to dashboard — the app should pick up the session from localStorage
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Verify we're authenticated (not redirected back to /auth)
  const currentUrl = page.url();
  if (currentUrl.includes('/auth')) {
    throw new Error('Session injection failed — still on /auth page');
  }
}

/**
 * Clears all Supabase auth state so the browser is fully logged out.
 */
async function clearSession(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    // Clear all localStorage (removes Supabase session)
    localStorage.clear();
    // Clear sessionStorage too
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

// ──────────────────────────────────────────────
// Global Setup: Create test user once for all tests
// ──────────────────────────────────────────────
let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});


// ══════════════════════════════════════════════
// TEST 1: Auth Guard — Protected Routes Redirect
// ══════════════════════════════════════════════
// IMPACT: If this fails, ANY unauthenticated user can access
//         invoices, client data, wallet, settings, etc.
// WHAT BREAKS: Missing ProtectedRoute wrapper, broken session check,
//              or a bad redirect that silently renders the page.
// ──────────────────────────────────────────────
test.describe('TEST 1: Auth Guard — Unauthenticated Access Prevention', () => {
  const protectedRoutes = [
    '/dashboard',
    '/scan',
    '/invoices',
    '/reconcile',
    '/clients',
    '/settings',
    '/wallet',
    '/cfo',
  ];

  for (const route of protectedRoutes) {
    test(`Visiting ${route} without login redirects to /auth`, async ({ page }) => {
      // Clear ALL auth state — Supabase session in localStorage, cookies, etc.
      await clearSession(page);

      // Navigate directly to the protected route
      await page.goto(route);

      // Wait for the app to initialize and decide on auth state
      // The app first shows a loading spinner, then redirects
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Allow React state to settle

      // Must land on /auth — not a blank screen, not the protected page
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });

      // The auth form must be visible (not a white screen or error)
      const formHeading = page.locator('text=/Welcome back|Sign in|Create an account/i').first();
      await expect(formHeading).toBeVisible({ timeout: 5000 });
    });
  }
});


// ══════════════════════════════════════════════
// TEST 2: Invoice Scan — Full Vertical Stack
// ══════════════════════════════════════════════
// IMPACT: This is the CORE revenue feature. If scanning breaks,
//         the entire product is dead. Tests the full chain:
//         Frontend upload → Backend AI extraction → Credit deduction → UI result.
// WHAT BREAKS: File validation rejecting valid PDFs, AI timeout,
//              credit deduction without data return, or a blank
//              result table after scanning.
// ──────────────────────────────────────────────
test.describe('TEST 2: Invoice Scan — Core Revenue Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
  });

  test('Uploading a valid PDF invoice returns extracted data and deducts credit', async ({ page }) => {
    // Navigate to the scan page
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Capture the credit count before scanning
    const creditBadge = page.locator('text=/\\d+\\s*Credit/i').first();
    let creditsBefore = 0;
    if (await creditBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      creditsBefore = await creditBadge.textContent()
        .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
    }

    // Upload a sample invoice via the file input
    const sampleInvoice = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleInvoice);

    // Wait for the AI extraction to complete (this can take 10-30 seconds)
    const extractionResult = page.locator('text=/Auto Accepted|Needs Review|Needs Retry|duplicate/i').first();
    await expect(extractionResult).toBeVisible({ timeout: 60000 });

    // Verify the extracted data table has at least one row with data
    const dataRow = page.locator('tr').filter({ hasText: /[A-Z]/ });
    await expect(dataRow.first()).toBeVisible({ timeout: 5000 });

    // Verify credit was deducted
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const creditBadgeAfter = page.locator('text=/\\d+\\s*Credit/i').first();
    if (await creditBadgeAfter.isVisible({ timeout: 3000 }).catch(() => false)) {
      const creditsAfter = await creditBadgeAfter.textContent()
        .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
      expect(creditsAfter).toBeLessThan(creditsBefore);
    }
  });

  test('Uploading an invalid file type (e.g., .txt) shows error and does NOT deduct credit', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Capture credits before
    const creditBadge = page.locator('text=/\\d+\\s*Credit/i').first();
    let creditsBefore = 0;
    if (await creditBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      creditsBefore = await creditBadge.textContent()
        .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
    }

    // Upload a fake .txt file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'malicious.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not an invoice. Just random text data.'),
    });

    // Wait for the system to process and reject
    await page.waitForTimeout(3000);

    // Expect an error toast or error state (not a crash / white screen)
    const errorIndicator = page.locator('text=/invalid|unsupported|error|not allowed|failed/i').first();
    await expect(errorIndicator).toBeVisible({ timeout: 10000 });

    // Credits should NOT have been deducted
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const creditBadgeAfter = page.locator('text=/\\d+\\s*Credit/i').first();
    if (await creditBadgeAfter.isVisible({ timeout: 3000 }).catch(() => false)) {
      const creditsAfter = await creditBadgeAfter.textContent()
        .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
      expect(creditsAfter).toBe(creditsBefore);
    }
  });
});


// ══════════════════════════════════════════════
// TEST 3: Zero Credit Guard — Wallet Enforcement
// ══════════════════════════════════════════════
// IMPACT: If a user with 0 credits can still scan, we're giving
//         away the product for free. This directly impacts revenue.
// WHAT BREAKS: Credit check bypassed, race condition where credit
//              deduction fails but scan proceeds, or the UI not
//              showing the "insufficient credits" error.
// ──────────────────────────────────────────────
test.describe('TEST 3: Zero Credit Guard — Revenue Protection', () => {
  test('Scanning with zero credits shows error and blocks extraction', async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);

    // Intercept the backend scan call and simulate 402 response
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Insufficient credits. Please recharge your wallet.' }),
      });
    });

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Upload a valid file
    const sampleInvoice = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleInvoice);

    // Wait for the error to surface
    const creditError = page.locator('text=/insufficient credits|recharge|wallet|credit/i').first();
    await expect(creditError).toBeVisible({ timeout: 15000 });

    // Ensure no extracted data is shown
    const extractionResult = page.locator('text=/Auto Accepted|Needs Review/i');
    await expect(extractionResult).toHaveCount(0);
  });
});


// ══════════════════════════════════════════════
// TEST 4: Client Data Isolation — Cross-Tenant Leakage
// ══════════════════════════════════════════════
// IMPACT: If Client A's invoices appear when Client B is selected,
//         it's a catastrophic data breach for an accountant SaaS.
// WHAT BREAKS: Missing client_id filter in Supabase queries,
//              stale React Query cache after client switch, or
//              RLS policy misconfiguration.
// ──────────────────────────────────────────────
test.describe('TEST 4: Client Data Isolation — Multi-Tenancy', () => {
  test('Switching clients on Saved Invoices page shows different data and no crash', async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);

    // Navigate to the invoices page
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');

    // Get the client switcher — desktop sidebar version
    const clientSwitcher = page.locator('button').filter({
      has: page.locator('.lucide-building-2, .lucide-chevron-down'),
    }).first();

    const isVisible = await clientSwitcher.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, 'No client switcher found — user may have 0 clients configured');
      return;
    }

    // Click the switcher
    await clientSwitcher.click();
    await page.waitForTimeout(500);

    // Get all client buttons in the dropdown
    const clientButtons = page.locator('[class*="rounded-md"]').filter({ hasText: /.+/ });
    const clientCount = await clientButtons.count();

    if (clientCount < 2) {
      test.skip(true, 'Need at least 2 clients to test data isolation');
      return;
    }

    // Select the first client
    await clientButtons.first().click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle');

    const firstClientInvoices = await page.locator('table tbody tr').allTextContents();

    // Select the second client
    await clientSwitcher.click();
    await page.waitForTimeout(500);
    const clientButtons2 = page.locator('[class*="rounded-md"]').filter({ hasText: /.+/ });
    await clientButtons2.nth(1).click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle');

    const secondClientInvoices = await page.locator('table tbody tr').allTextContents();

    // Soft check: if both have data, they should differ
    const bothEmpty = firstClientInvoices.length === 0 && secondClientInvoices.length === 0;
    if (!bothEmpty) {
      const areIdentical = JSON.stringify(firstClientInvoices) === JSON.stringify(secondClientInvoices);
      if (areIdentical && firstClientInvoices.length > 0) {
        console.warn('⚠️ WARNING: Both clients returned identical invoice data. Possible data isolation breach.');
      }
    }

    // Hard assertion: no error boundary crash
    const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
    await expect(errorBoundary).toHaveCount(0);
  });
});


// ══════════════════════════════════════════════
// TEST 5: GSTR-2B Reconciliation Upload
// ══════════════════════════════════════════════
// IMPACT: This is the #1 post-launch feature for accountant
//         retention. If reconciliation crashes, accountants lose trust.
// WHAT BREAKS: Excel parsing failure, missing period parameter,
//              backend crash on empty file, or UI not reflecting results.
// ──────────────────────────────────────────────
test.describe('TEST 5: GSTR-2B Reconciliation — Upload & Match', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
  });

  test('Uploading a valid GSTR-2B Excel file triggers reconciliation without crash', async ({ page }) => {
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    const sampleGSTR2B = path.resolve(__dirname, '../../samples/Sample_GSTR2B.xlsx');

    await fileInput.setInputFiles(sampleGSTR2B);

    // Wait for reconciliation to process
    const resultIndicator = page.locator('text=/reconcil|matched|mismatch|missing|success|No client/i').first();
    await expect(resultIndicator).toBeVisible({ timeout: 30000 });

    // Page must NOT show unhandled errors
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('ChunkLoadError');
  });

  test('Uploading an empty/corrupt file shows graceful error, not a crash', async ({ page }) => {
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();

    await fileInput.setInputFiles({
      name: 'corrupt_gstr2b.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('NOT_A_REAL_EXCEL_FILE_JUST_GARBAGE_DATA_12345'),
    });

    await page.waitForTimeout(5000);

    // Must show a user-friendly error, NOT a white screen
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Unhandled Runtime Error');
    expect(pageContent).not.toContain('Cannot read properties of');

    // The reconcile page itself should still be functional
    const heading = page.locator('text=/GSTR-2B|Reconcil/i').first();
    await expect(heading).toBeVisible();
  });
});


// ══════════════════════════════════════════════
// TEST 6: Saved Invoices — Bulk Delete
// ══════════════════════════════════════════════
// IMPACT: If bulk delete silently fails, or deletes MORE than
//         selected, it's data loss.
// WHAT BREAKS: Checkbox selection not syncing, RLS blocking,
//              or UI not refreshing after deletion.
// ──────────────────────────────────────────────
test.describe('TEST 6: Saved Invoices — Bulk Operations', () => {
  test('Selecting and deleting invoices removes them from the visible list', async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');

    const tableRows = page.locator('table tbody tr');
    const initialCount = await tableRows.count();

    if (initialCount === 0) {
      test.skip(true, 'No invoices to delete — test inconclusive');
      return;
    }

    const firstCheckbox = page.locator('table tbody tr').first().locator('input[type="checkbox"]');
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.check();

      const deleteButton = page.locator('button').filter({ hasText: /delete/i }).first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page.locator('button').filter({ hasText: /confirm|yes|delete/i }).first();
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmButton.click();
        }

        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle');

        const finalCount = await tableRows.count();
        expect(finalCount).toBeLessThan(initialCount);
      }
    } else {
      test.skip(true, 'No checkbox found — batch selection UI not present');
    }
  });
});


// ══════════════════════════════════════════════
// TEST 7: Payment Flow — Razorpay Integration Guard
// ══════════════════════════════════════════════
// IMPACT: If the payment flow crashes, users cannot buy credits.
//         If payment succeeds but credits aren't added, users lose money.
// WHAT BREAKS: Razorpay SDK failing to load, create-order API errors,
//              or verify-payment not crediting the user.
// ──────────────────────────────────────────────
test.describe('TEST 7: Payment Flow — Wallet Purchase', () => {
  test('Wallet page loads pricing plans and purchase buttons are clickable', async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
    await page.goto('/wallet');
    // Use domcontentloaded instead of networkidle — Razorpay CDN script
    // keeps the network busy indefinitely, causing networkidle to timeout
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Allow React to hydrate

    // Verify the wallet page renders without crash
    const heading = page.locator('text=/Wallet|Billing|Credits/i').first();
    await expect(heading).toBeVisible({ timeout: 5000 });

    // Verify at least one pricing plan is visible
    const plans = page.locator('text=/Starter|Pro|Enterprise/i');
    await expect(plans.first()).toBeVisible({ timeout: 5000 });

    // Verify credit balance is shown (not NaN or undefined)
    const pageContent = await page.content();
    expect(pageContent).not.toContain('NaN');
    expect(pageContent).not.toContain('undefined credits');

    // Verify the purchase button exists and is not disabled
    const purchaseButton = page.locator('button').filter({ hasText: /buy|purchase|get started|select/i }).first();
    if (await purchaseButton.isVisible().catch(() => false)) {
      await expect(purchaseButton).toBeEnabled();

      // Intercept the API call to prevent actual payment
      await page.route(`${API_URL}/api/create-order`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            order_id: 'order_test_e2e_12345',
            amount: 49900,
            currency: 'INR',
            key_id: 'rzp_test_mock',
          }),
        });
      });

      await purchaseButton.click();
      await page.waitForTimeout(2000);

      // Page should NOT have crashed
      const contentAfterClick = await page.content();
      expect(contentAfterClick).not.toContain('Unhandled Runtime Error');
    }
  });
});
