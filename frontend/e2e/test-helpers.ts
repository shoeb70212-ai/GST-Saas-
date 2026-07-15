import { type Page } from '@playwright/test';

const TEST_EMAIL = `e2e-test-${Date.now()}@khatalens.com`;
const TEST_PASSWORD = 'E2eTest!Secure#2026';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wmxwjkmxyrngvitxseei.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHdqa214eXJuZ3ZpdHhzZWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTY0NzQsImV4cCI6MjA5ODI5MjQ3NH0.DyuLxMV5ydyRNK_tLESPX6HT-H8ZHrF61FLzDiYs7As';

export async function signUpTestUser(): Promise<{ access_token: string; user_id: string }> {
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
  if (data.access_token) {
    return { access_token: data.access_token, user_id: data.user?.id || '' };
  }
  
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

export async function loginViaSessionInjection(page: Page, accessToken: string) {
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
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');

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

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  const currentUrl = page.url();
  if (currentUrl.includes('/auth')) {
    throw new Error('Session injection failed — still on /auth page');
  }
}

export async function clearSession(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

export async function injectActiveClientContext(page: Page, clientId: string = 'test-client-123') {
  await page.evaluate((id) => {
    localStorage.setItem('khatalens-active-client-id', id);
  }, clientId);
}
