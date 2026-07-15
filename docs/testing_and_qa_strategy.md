# Testing & QA Strategy

To guarantee the "Zero Hallucination" mandate, KhataLens relies on a rigorous, two-pronged automated testing strategy.

## 1. Backend Unit Testing (Pytest)
The backend test suite is designed to validate the core mathematical logic of the reconciliation engine without incurring LLM costs or touching the production database.

**Stack:**
- `pytest`, `pytest-asyncio`, `pytest-mock`, `pytest-cov`

**Test Location:** `backend/tests/`

**Key Mocking Strategies:**
1. **Supabase Client Mocking:** We use a custom `ChainableMock` in `conftest.py` that intercepts calls like `supabase.table('...').select().eq().execute()` and returns deterministic JSON fixtures. This prevents the tests from needing a live network connection to Supabase.
2. **OpenAI Mocking:** We mock `client.beta.chat.completions.parse` to return a predefined `ReconciliationResponse` object. This ensures the AI fuzzy matching logic can be tested for speed and structure without burning OpenAI API credits.

**Running the tests:**
```bash
cd backend
pytest tests/ -v --cov=.
```

## 2. Frontend End-to-End Testing (Playwright Pro)
The frontend uses Playwright to simulate real CA user workflows on the dashboard.

**Stack:**
- `@playwright/test`

**Test Location:** `frontend/e2e/`

**Playwright Pro Rules Enforced:**
- **Web-First Assertions:** We use `await expect(locator).toBeVisible()` instead of hard sleeps (`waitForTimeout`).
- **Locator Strategy:** We strictly use `getByRole`, `getByText`, and `getByPlaceholder` for accessibility-first testing.
- **Auth Bypassing:** Instead of logging in via the UI on every single test (which is slow and flaky), we use a helper `loginViaSessionInjection` to inject a Supabase JWT directly into the browser context `localStorage` before the test starts.

**Key Workflows Tested:**
- `bank-reconcile.spec.ts`: Tests the Split-View UI layout, the 'Approve' and 'Reject' buttons, and the Undo history logic.
- `bank-statements.spec.ts`: Tests the PDF upload dropzone, the polling mechanism for 'processing' status, and the expandable transaction rows.

**Running the tests:**
```bash
cd frontend
npx playwright test e2e/bank-statements.spec.ts e2e/bank-reconcile.spec.ts
```

## 3. Continuous Integration (GitHub Actions)
*(Pending Phase 4 Implementation)*
- Upon PR creation, the backend Pytest suite will run automatically.
- The Playwright tests will run via a headed/headless worker using the local Vite `webServer` configuration. 
- Coverage must remain above 80% for the PR to be mergeable.
