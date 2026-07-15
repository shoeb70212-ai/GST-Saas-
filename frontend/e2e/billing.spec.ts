import { test, expect } from '@playwright/test';
import { signUpTestUser, loginViaSessionInjection } from './test-helpers';

let testAccessToken = '';

test.beforeAll(async () => {
  const { access_token } = await signUpTestUser();
  testAccessToken = access_token;
});

test.describe('Billing & Subscriptions Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaSessionInjection(page, testAccessToken);
    // Don't goto wallet yet, let tests setup routes first
  });

  test('Checkout Redirect Mock (Razorpay Init)', async ({ page }) => {
    // Intercept the create-order API call
    let orderApiCalled = false;
    await page.route('**/api/create-order', async (route) => {
      orderApiCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key_id: 'rzp_test_mock',
          amount: 49900,
          currency: 'INR',
          order_id: 'order_mock_123'
        }),
      });
    });

    // We can intercept the Razorpay script so it doesn't overwrite our mock,
    // or we can just mock the script response itself!
    await page.route('https://checkout.razorpay.com/v1/checkout.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.Razorpay = class {
            constructor(options) {
              this.options = options;
            }
            on() {}
            open() {
              setTimeout(() => {
                if (this.options && this.options.handler) {
                  this.options.handler({
                    razorpay_payment_id: 'pay_mock',
                    razorpay_order_id: 'order_mock_123',
                    razorpay_signature: 'sig_mock'
                  });
                }
              }, 500);
            }
          };
        `
      });
    });

    // Also intercept verify-payment API
    let verifyApiCalled = false;
    await page.route('**/api/verify-payment', async (route) => {
      verifyApiCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Payment verified' }),
      });
    });

    // NOW navigate to the page so it intercepts the script load
    await page.goto('/wallet');
    await page.waitForLoadState('networkidle');

    // Find the Purchase button for the first plan (Starter Bundle)
    const buyBtn = page.locator('button:has-text("Purchase")').first();
    await buyBtn.click();

    // Verify the API was called to create the order
    expect(orderApiCalled).toBe(true);

    // Because of our Razorpay mock, it should automatically call the handler and verify the payment
    const successToast = page.locator('text=/Successfully added.*credits/i');
    await expect(successToast).toBeVisible({ timeout: 15000 });
    
    expect(verifyApiCalled).toBe(true);
  });
});
