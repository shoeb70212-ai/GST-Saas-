/**
 * Tally Converter E2E — upload mocked detect → preview → export download path.
 */
import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

const API_URL = process.env.VITE_API_URL || 'http://localhost:8000';

let sharedSession: Awaited<ReturnType<typeof signUpTestUser>>;

const SAMPLE_DOCUMENT = {
  doc_type: 'purchase_register',
  masters: [
    { kind: 'ledger', name: 'Vendor Z', parent: 'Sundry Creditors', auto_create: true },
    { kind: 'ledger', name: 'Purchase', parent: 'Purchase Accounts', auto_create: true },
  ],
  vouchers: [
    {
      vtype: 'Purchase',
      date: '2024-01-10',
      number: 'PR-1',
      party: 'Vendor Z',
      narration: 'Sample',
      ledger_legs: [
        { ledger: 'Vendor Z', is_debit: false, amount: 1180, is_party_ledger: true, bill_allocations: [] },
        { ledger: 'Purchase', is_debit: true, amount: 1000, is_party_ledger: false, bill_allocations: [] },
        { ledger: 'CGST', is_debit: true, amount: 90, is_party_ledger: false, bill_allocations: [] },
        { ledger: 'SGST', is_debit: true, amount: 90, is_party_ledger: false, bill_allocations: [] },
      ],
      inventory: [],
      confidence: 0.9,
    },
  ],
  warnings: [],
};

test.beforeAll(async () => {
  sharedSession = await signUpTestUser();
});

test.describe('Tally Converter', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, sharedSession);
    await page.goto('/app/tally-converter');
    await page.waitForLoadState('networkidle');
  });

  test('page renders without crash', async ({ page }) => {
    await expect(page.getByText(/Tally Converter/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/something went wrong/i')).toHaveCount(0);
  });

  test('upload → preview → export happy path (mocked API)', async ({ page }) => {
    await page.route(`${API_URL}/api/tally-converter/detect`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          doc_type: 'purchase_register',
          detected_doc_type: 'purchase_register',
          confidence: 0.9,
          cost_credits: 2,
          document: SAMPLE_DOCUMENT,
          row_count: 1,
        }),
      });
    });

    await page.route(`${API_URL}/api/tally-converter/export`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          xml: '<?xml version="1.0"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER></ENVELOPE>',
          excel_template: 'Date,Voucher Type\n20240110,Purchase\n',
          report: {
            ok: true,
            voucher_count: 1,
            master_create_count: 2,
            master_mapped_count: 0,
            issues: [],
            auto_round_off_applied: 0,
          },
          document: SAMPLE_DOCUMENT,
          warnings: [],
        }),
      });
    });

    const dropzone = page.getByTestId('tally-converter-dropzone');
    if (!(await dropzone.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Client may not be selected — page shows select-client message
      const needClient = page.getByText(/Select a client/i);
      if (await needClient.isVisible().catch(() => false)) {
        test.skip(true, 'No active client in test session');
        return;
      }
    }

    const fileInput = page.locator('input[type="file"]').first();
    const csv = Buffer.from(
      'Invoice Date,Invoice Number,Supplier Name,Amount,Taxable Amount,CGST,SGST\n' +
        '2024-01-10,PR-1,Vendor Z,1180,1000,90,90\n',
    );
    await fileInput.setInputFiles({
      name: 'purchase_register.csv',
      mimeType: 'text/csv',
      buffer: csv,
    });

    await expect(page.getByText(/Preview/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Vendor Z').first()).toBeVisible();

    const exportBtn = page.getByTestId('tally-converter-export');
    await expect(exportBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await exportBtn.click();
    await expect(page.getByTestId('tally-validation-report')).toBeVisible({ timeout: 10000 });
    await downloadPromise;
  });
});
