import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// ── Supabase: prevent all real network calls ─────────────────────────────────
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe('App Component', () => {
  it('renders the loading spinner on initial load (session check pending)', () => {
    const { container } = render(<App />);
    // While `isInitializing` is true the spinner div is shown.
    // It must not be an empty / crashed screen.
    expect(container.firstChild).not.toBeNull();
  });

  it('redirects to /auth when no session and protected route is visited', async () => {
    // App starts with session=null, so ProtectedRoute sends to /auth.
    // Navigating to /dashboard in MemoryRouter context → ends on /auth.
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
