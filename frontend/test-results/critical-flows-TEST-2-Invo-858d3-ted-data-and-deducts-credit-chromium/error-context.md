# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: critical-flows.spec.ts >> TEST 2: Invoice Scan — Core Revenue Flow >> Uploading a valid PDF invoice returns extracted data and deducts credit
- Location: e2e\critical-flows.spec.ts:259:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/Auto Accepted|Needs Review|Needs Retry|duplicate/i').first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for locator('text=/Auto Accepted|Needs Review|Needs Retry|duplicate/i').first()

```

```yaml
- img
- text: KhataLens
- button "Select Client"
- textbox "Search clients..."
- text: No results found
- link "Manage Clients":
  - /url: /clients
- text: Menu
- navigation:
  - link "Dashboard":
    - /url: /dashboard
  - link "Scan":
    - /url: /scan
  - link "Invoices":
    - /url: /invoices
  - link "Tax Liability":
    - /url: /tax-liability
  - link "Virtual CFO":
    - /url: /cfo
  - link "GSTR-2B":
    - /url: /reconcile
  - link "Bank Stmts":
    - /url: /bank-statements
  - link "Bank Match":
    - /url: /bank-reconcile
  - link "Clients":
    - /url: /clients
  - link "Audit Logs":
    - /url: /audit-logs
  - link "Wallet & Billing":
    - /url: /wallet
  - link "Settings":
    - /url: /settings
- button "Sign Out"
- link "Quick Scan":
  - /url: /scan
- text: 100 Credits
- button "Toggle Theme"
- text: ME
- main:
  - heading "Digitize." [level=1]
  - paragraph: Drop messy invoices, get perfect data.
  - button "Images / PDFs"
  - button "ZIP Batch"
  - button "Choose File"
  - paragraph: Drag & drop invoices
  - paragraph: JPG, PNG, PDF (Max 50 files)
  - text: PDF Password (Optional)
  - textbox "If the PDF is password-protected"
  - heading "Queue (1)" [level=3]
  - button "Clear"
  - button "Extract All"
  - paragraph: Sample_Invoice_1.pdf
  - paragraph: Failed to fetch
  - button "Retry"
  - button "Remove"
  - heading "Verification Grid" [level=2]
  - button "Column Settings"
  - button "Select Client" [disabled]
  - button "Custom Report" [disabled]
  - heading "No Invoices Extracted" [level=3]
  - paragraph: Drag and drop your invoices in the panel on the left to begin the automated data extraction process.
```

# Test source

```ts
  200 | // ══════════════════════════════════════════════
  201 | // TEST 1: Auth Guard — Protected Routes Redirect
  202 | // ══════════════════════════════════════════════
  203 | // IMPACT: If this fails, ANY unauthenticated user can access
  204 | //         invoices, client data, wallet, settings, etc.
  205 | // WHAT BREAKS: Missing ProtectedRoute wrapper, broken session check,
  206 | //              or a bad redirect that silently renders the page.
  207 | // ──────────────────────────────────────────────
  208 | test.describe('TEST 1: Auth Guard — Unauthenticated Access Prevention', () => {
  209 |   const protectedRoutes = [
  210 |     '/dashboard',
  211 |     '/scan',
  212 |     '/invoices',
  213 |     '/reconcile',
  214 |     '/clients',
  215 |     '/settings',
  216 |     '/wallet',
  217 |     '/cfo',
  218 |   ];
  219 | 
  220 |   for (const route of protectedRoutes) {
  221 |     test(`Visiting ${route} without login redirects to /auth`, async ({ page }) => {
  222 |       // Clear ALL auth state — Supabase session in localStorage, cookies, etc.
  223 |       await clearSession(page);
  224 | 
  225 |       // Navigate directly to the protected route
  226 |       await page.goto(route);
  227 | 
  228 |       // Wait for the app to initialize and decide on auth state
  229 |       // The app first shows a loading spinner, then redirects
  230 |       await page.waitForLoadState('networkidle');
  231 |       await page.waitForTimeout(2000); // Allow React state to settle
  232 | 
  233 |       // Must land on /auth — not a blank screen, not the protected page
  234 |       await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  235 | 
  236 |       // The auth form must be visible (not a white screen or error)
  237 |       const formHeading = page.locator('text=/Welcome back|Sign in|Create an account/i').first();
  238 |       await expect(formHeading).toBeVisible({ timeout: 5000 });
  239 |     });
  240 |   }
  241 | });
  242 | 
  243 | 
  244 | // ══════════════════════════════════════════════
  245 | // TEST 2: Invoice Scan — Full Vertical Stack
  246 | // ══════════════════════════════════════════════
  247 | // IMPACT: This is the CORE revenue feature. If scanning breaks,
  248 | //         the entire product is dead. Tests the full chain:
  249 | //         Frontend upload → Backend AI extraction → Credit deduction → UI result.
  250 | // WHAT BREAKS: File validation rejecting valid PDFs, AI timeout,
  251 | //              credit deduction without data return, or a blank
  252 | //              result table after scanning.
  253 | // ──────────────────────────────────────────────
  254 | test.describe('TEST 2: Invoice Scan — Core Revenue Flow', () => {
  255 |   test.beforeEach(async ({ page }) => {
  256 |     await loginViaSessionInjection(page, testAccessToken);
  257 |   });
  258 | 
  259 |   test('Uploading a valid PDF invoice returns extracted data and deducts credit', async ({ page }) => {
  260 |     // Navigate to the scan page
  261 |     await page.goto('/scan');
  262 |     await page.waitForLoadState('networkidle');
  263 | 
  264 |     // Select a client if none is selected
  265 |     const clientSwitcher = page.locator('button').filter({
  266 |       has: page.locator('.lucide-building-2, .lucide-chevron-down'),
  267 |     }).first();
  268 |     try {
  269 |       await clientSwitcher.waitFor({ state: 'visible', timeout: 5000 });
  270 |       await clientSwitcher.click();
  271 |       await page.waitForTimeout(500);
  272 |       const clientButtons = page.locator('.max-h-48 button');
  273 |       if (await clientButtons.count() > 0) {
  274 |         await clientButtons.first().click({ force: true });
  275 |         await page.waitForTimeout(1500);
  276 |       }
  277 |     } catch (_e) {
  278 |       // client switcher not found, maybe 0 clients
  279 |     }
  280 | 
  281 |     // Capture the credit count before scanning
  282 |     const creditBadge = page.locator('text=/\\d+\\s*Credit/i').first();
  283 |     let creditsBefore = 0;
  284 |     if (await creditBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
  285 |       creditsBefore = await creditBadge.textContent()
  286 |         .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
  287 |     }
  288 | 
  289 |     // Upload a sample invoice via the file input
  290 |     const sampleInvoicePath = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
  291 |     const fileInput = page.locator('input[type="file"]').first();
  292 |     await fileInput.setInputFiles({
  293 |       name: 'Sample_Invoice_1.pdf',
  294 |       mimeType: 'application/pdf',
  295 |       buffer: fs.readFileSync(sampleInvoicePath)
  296 |     });
  297 | 
  298 |     // Wait for the AI extraction to complete (this can take 10-30 seconds)
  299 |     const extractionResult = page.locator('text=/Auto Accepted|Needs Review|Needs Retry|duplicate/i').first();
> 300 |     await expect(extractionResult).toBeVisible({ timeout: 60000 });
      |                                    ^ Error: expect(locator).toBeVisible() failed
  301 | 
  302 |     // Verify the extracted data table has at least one row with data
  303 |     const dataRow = page.locator('tr').filter({ hasText: /[A-Z]/ });
  304 |     await expect(dataRow.first()).toBeVisible({ timeout: 5000 });
  305 | 
  306 |     // Verify credit was deducted
  307 |     await page.goto('/dashboard');
  308 |     await page.waitForLoadState('networkidle');
  309 | 
  310 |     const creditBadgeAfter = page.locator('text=/\\d+\\s*Credit/i').first();
  311 |     if (await creditBadgeAfter.isVisible({ timeout: 3000 }).catch(() => false)) {
  312 |       const creditsAfter = await creditBadgeAfter.textContent()
  313 |         .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
  314 |       expect(creditsAfter).toBeLessThan(creditsBefore);
  315 |     }
  316 |   });
  317 | 
  318 |   test('Uploading an invalid file type (e.g., .txt) shows error and does NOT deduct credit', async ({ page }) => {
  319 |     await page.goto('/scan');
  320 |     await page.waitForLoadState('networkidle');
  321 | 
  322 |     // Capture credits before
  323 |     const creditBadge = page.locator('text=/\\d+\\s*Credit/i').first();
  324 |     let creditsBefore = 0;
  325 |     if (await creditBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
  326 |       creditsBefore = await creditBadge.textContent()
  327 |         .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
  328 |     }
  329 | 
  330 |     // Upload a fake .txt file
  331 |     const fileInput = page.locator('input[type="file"]').first();
  332 |     await fileInput.setInputFiles({
  333 |       name: 'malicious.txt',
  334 |       mimeType: 'text/plain',
  335 |       buffer: Buffer.from('This is not an invoice. Just random text data.'),
  336 |     });
  337 | 
  338 |     // Wait for the system to process and reject
  339 |     await page.waitForTimeout(3000);
  340 | 
  341 |     // Expect an error toast or error state (not a crash / white screen)
  342 |     const errorIndicator = page.locator('text=/invalid|unsupported|error|not allowed|failed/i').first();
  343 |     await expect(errorIndicator).toBeVisible({ timeout: 10000 });
  344 | 
  345 |     // Credits should NOT have been deducted
  346 |     await page.goto('/dashboard');
  347 |     await page.waitForLoadState('networkidle');
  348 |     const creditBadgeAfter = page.locator('text=/\\d+\\s*Credit/i').first();
  349 |     if (await creditBadgeAfter.isVisible({ timeout: 3000 }).catch(() => false)) {
  350 |       const creditsAfter = await creditBadgeAfter.textContent()
  351 |         .then(t => parseInt(t?.replace(/[^0-9]/g, '') || '0'));
  352 |       expect(creditsAfter).toBe(creditsBefore);
  353 |     }
  354 |   });
  355 | });
  356 | 
  357 | 
  358 | // ══════════════════════════════════════════════
  359 | // TEST 3: Zero Credit Guard — Wallet Enforcement
  360 | // ══════════════════════════════════════════════
  361 | // IMPACT: If a user with 0 credits can still scan, we're giving
  362 | //         away the product for free. This directly impacts revenue.
  363 | // WHAT BREAKS: Credit check bypassed, race condition where credit
  364 | //              deduction fails but scan proceeds, or the UI not
  365 | //              showing the "insufficient credits" error.
  366 | // ──────────────────────────────────────────────
  367 | test.describe('TEST 3: Zero Credit Guard — Revenue Protection', () => {
  368 |   test('Scanning with zero credits shows error and blocks extraction', async ({ page }) => {
  369 |     await loginViaSessionInjection(page, testAccessToken);
  370 | 
  371 |     // Intercept the backend scan call and simulate 402 response
  372 |     await page.route('**/api/scan', async (route) => {
  373 |       await route.fulfill({
  374 |         status: 402,
  375 |         contentType: 'application/json',
  376 |         body: JSON.stringify({ detail: 'Insufficient credits. Please recharge your wallet.' }),
  377 |       });
  378 |     });
  379 | 
  380 |     await page.goto('/scan');
  381 |     await page.waitForLoadState('networkidle');
  382 | 
  383 |     // Upload a valid file
  384 |     const sampleInvoicePath = path.resolve(__dirname, '../../samples/Sample_Invoice_1.pdf');
  385 |     const fileInput = page.locator('input[type="file"]').first();
  386 |     await fileInput.setInputFiles({
  387 |       name: 'Sample_Invoice_1.pdf',
  388 |       mimeType: 'application/pdf',
  389 |       buffer: fs.readFileSync(sampleInvoicePath)
  390 |     });
  391 | 
  392 |     // Wait for the error to surface
  393 |     const creditError = page.locator('text=/insufficient credits|recharge|wallet|credit/i').first();
  394 |     await expect(creditError).toBeVisible({ timeout: 15000 });
  395 | 
  396 |     // Ensure no extracted data is shown
  397 |     const extractionResult = page.locator('text=/Auto Accepted|Needs Review/i');
  398 |     await expect(extractionResult).toHaveCount(0);
  399 |   });
  400 | });
```