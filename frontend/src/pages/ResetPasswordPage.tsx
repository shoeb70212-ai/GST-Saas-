import { useState, useEffect  } from "react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

type PageState = 'verifying' | 'ready' | 'success' | 'error';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase sends the session token in the URL hash when the user
  // clicks the reset link in their email. We listen for the session
  // to be established before allowing the password change form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready');
      }
    });

    // Also check if there's already a session (e.g. page reload after token exchange)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState('ready');
      }
    });

    // Timeout: if no PASSWORD_RECOVERY event fires within 8s, show error
    const timeout = setTimeout(() => {
      setPageState((prev) => prev === 'verifying' ? 'error' : prev);
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPageState('success');
      toast.success('Password updated successfully!');
      // Give the user a moment to see the success state, then redirect
      setTimeout(() => navigate('/auth', { replace: true }), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const slideVariant = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as any } },
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
            <img src="/favicon.png" alt="KhataLens" className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-text-primary mb-1">KhataLens</h1>
          <p className="text-text-secondary text-sm font-light">Password Reset</p>
        </div>

        <div className="card p-8 shadow-md overflow-hidden">

          {/* ── VERIFYING ── */}
          {pageState === 'verifying' && (
            <motion.div variants={slideVariant} initial="hidden" animate="visible" className="text-center py-6">
              <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" aria-label="Verifying reset link" />
              <p className="text-text-secondary font-light">Verifying your reset link…</p>
            </motion.div>
          )}

          {/* ── ERROR (invalid / expired link) ── */}
          {pageState === 'error' && (
            <motion.div variants={slideVariant} initial="hidden" animate="visible" className="text-center">
              <div className="w-16 h-16 rounded-full bg-error-subtle border border-error/20 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-error" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Link expired or invalid</h2>
              <p className="text-text-secondary font-light leading-relaxed mb-8">
                This reset link has expired or has already been used. Password reset links are valid for 1 hour.
              </p>
              <button
                onClick={() => navigate('/auth', { replace: true })}
                className="btn-primary w-full h-11"
              >
                Request a new link
              </button>
            </motion.div>
          )}

          {/* ── SUCCESS ── */}
          {pageState === 'success' && (
            <motion.div variants={slideVariant} initial="hidden" animate="visible" className="text-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-accent" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Password updated!</h2>
              <p className="text-text-secondary font-light">Redirecting you to sign in…</p>
              <Loader2 className="w-5 h-5 text-accent animate-spin mx-auto mt-4" aria-label="Redirecting" />
            </motion.div>
          )}

          {/* ── READY — Password Form ── */}
          {pageState === 'ready' && (
            <motion.div variants={slideVariant} initial="hidden" animate="visible">
              <h2 className="text-xl font-display font-semibold text-text-primary mb-2">Set a new password</h2>
              <p className="text-sm text-text-secondary font-light mb-6">
                Choose a strong password of at least 8 characters.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="text-sm font-medium text-text-primary block">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                    <input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field w-full !pl-10"
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  {/* Password strength indicator */}
                  {password.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {[1, 2, 3, 4].map((level) => {
                        const strength = Math.min(4, Math.floor(password.length / 3));
                        const colors = ['bg-error', 'bg-warning', 'bg-warning', 'bg-accent'];
                        return (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              level <= strength ? colors[strength - 1] : 'bg-border'
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="text-sm font-medium text-text-primary block">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`input-field w-full !pl-10 ${
                        confirmPassword && confirmPassword !== password
                          ? '!border-error/50 !ring-error/20'
                          : ''
                      }`}
                      placeholder="Repeat your password"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-xs text-error mt-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <p role="alert" className="text-sm text-center py-2.5 px-4 rounded-lg bg-error-subtle border border-error/20 text-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || (!!confirmPassword && confirmPassword !== password)}
                  id="reset-password-submit"
                  className="btn-primary w-full h-11 text-base mt-1"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Updating" /> : 'Update Password'}
                </button>
              </form>
            </motion.div>
          )}
        </div>

        <p className="text-center text-xs text-text-disabled mt-6 font-light">
          &copy; {new Date().getFullYear()} KhataLens. Built for Chartered Accountants.
        </p>
      </div>
    </div>
  );
}
