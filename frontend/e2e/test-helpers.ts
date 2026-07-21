/**
 * Shared helpers for KhataLens Playwright E2E tests.
 *
 * Key design decisions:
 *  - signUpTestUser: Each test file uses a unique timestamp-based email so
 *    parallel test runs don't conflict. Falls back to sign-in if user exists.
 *  - loginViaSessionInjection: Bypasses the login form by injecting the
 *    Supabase session directly into localStorage. Faster and more reliable
 *    than form-based login for test setup.
 *  - clearSession: Wipes all auth state so unauthenticated tests start clean.
 */
import { type Page } from '@playwright/test';

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

function requireSupabaseEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'E2E tests require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment.'
    );
  }
}

/** Derive the Supabase project ref from the URL for the localStorage key. */
export function getProjectRef(): string {
  const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) {
    throw new Error('Could not derive Supabase project ref from VITE_SUPABASE_URL.');
  }
  return ref;
}

/** The localStorage key where Supabase JS stores the session. */
export function getStorageKey(): string {
  return `sb-${getProjectRef()}-auth-token`;
}

export interface TestUserSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: { id: string; email: string };
}

/**
 * Sign up (or sign in if already exists) a test user via the Supabase REST API.
 * Returns the full session object needed for localStorage injection.
 */
export async function signUpTestUser(
  email?: string,
  password = 'E2eTest!Secure#2026'
): Promise<TestUserSession> {
  requireSupabaseEnv();
  const testEmail = email ?? `e2e-${Date.now()}@khatalens-test.com`;

  // Try sign-up first
  const signUpRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password }),
  });

  const signUpData = await signUpRes.json();

  // If signup returned a session directly (email confirmation disabled)
  if (signUpData.access_token) {
    return signUpData as TestUserSession;
  }

  // Otherwise sign in
  const signInRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password }),
    }
  );

  if (!signInRes.ok) {
    throw new Error(
      `Could not sign up or sign in test user "${testEmail}": ${await signInRes.text()}`
    );
  }

  return (await signInRes.json()) as TestUserSession;
}

/**
 * Inject a Supabase session into the page's localStorage and navigate to
 * /dashboard. Throws if the app still shows /auth after injection.
 */
export async function loginViaSessionInjection(
  page: Page,
  session: TestUserSession
): Promise<void> {
  // Navigate to /auth first so we're on the right origin
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: getStorageKey(),
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    }
  );

  await page.goto('/app/dashboard');
  await page.waitForLoadState('networkidle');

  if (page.url().includes('/auth')) {
    throw new Error('Session injection failed — app still shows /auth');
  }
}

/**
 * Wipe all Supabase auth state from the browser context.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/**
 * Create a minimal valid 1×1 JPEG as a Buffer (for file upload tests).
 */
export function makeMinimalJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x7f, 0xff, 0xd9,
  ]);
}
