import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Sets read-only support mode flag, then redirects to Supabase magic link
 * (or /app/dashboard if redirect missing).
 *
 * Server-side enforcement: tenant JWT carries app_metadata.is_support_session
 * (stamped before the magic link). Exit via Layout banner → POST /api/support/end.
 */
export default function SupportEnterPage() {
  const [params] = useSearchParams();

  useEffect(() => {
    try {
      localStorage.setItem('khatalens_support_mode', '1');
      localStorage.setItem('khatalens_support_mode_at', String(Date.now()));
    } catch {
      /* ignore */
    }
    const redirect = params.get('redirect');
    if (redirect) {
      window.location.href = redirect;
    } else {
      window.location.href = '/app/dashboard';
    }
  }, [params]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-bg-base">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
      <p className="text-sm text-text-secondary">Entering read-only support session…</p>
    </div>
  );
}
