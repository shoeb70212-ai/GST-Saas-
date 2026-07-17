import { useState  } from "react";
import { supabase } from '../lib/supabase';
import { Loader2, Mail, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

export default function AuthPage() {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'dev@khatalens.com' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'DevPass123!' : '');
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const resetForm = () => {
    setError(null);
    setResetSent(false);
  };

  const switchMode = (next: AuthMode) => {
    resetForm();
    setMode(next);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Account created! Check your email to verify, then sign in.', { duration: 6000 });
        switchMode('sign-in');

      } else if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

      } else if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const slideVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as any } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-4 selection:bg-accent-subtle">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 shadow-sm">
            <img src="/favicon.png" alt="KhataLens" className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-text-primary mb-1">KhataLens</h1>
          <p className="text-text-secondary text-sm font-light">Smart GST Invoice Processing</p>
        </div>

        {/* Card */}
        <div className="card p-8 shadow-md overflow-hidden">
          <AnimatePresence mode="wait">

            {/* ── FORGOT PASSWORD SUCCESS STATE ── */}
            {mode === 'forgot-password' && resetSent ? (
              <motion.div
                key="reset-sent"
                variants={slideVariant}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-center"
              >
                <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Check your inbox</h2>
                <p className="text-text-secondary font-light leading-relaxed mb-8">
                  We've sent a password reset link to <strong className="text-text-primary font-medium">{email}</strong>. 
                  The link expires in 1 hour.
                </p>
                <p className="text-sm text-text-disabled mb-6">Didn't receive it? Check your spam folder.</p>
                <button
                  onClick={() => { setResetSent(false); switchMode('sign-in'); }}
                  className="btn-primary w-full h-11"
                >
                  Back to Sign In
                </button>
              </motion.div>

            ) : (
              <motion.div
                key={mode}
                variants={slideVariant}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {/* Header row */}
                <div className="flex items-center gap-3 mb-6">
                  {mode !== 'sign-in' && (
                    <button
                      onClick={() => switchMode('sign-in')}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-focus transition-all cursor-pointer"
                      aria-label="Go back"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <h2 className="text-xl font-display font-semibold text-text-primary">
                    {mode === 'sign-in' && 'Welcome back'}
                    {mode === 'sign-up' && 'Create an account'}
                    {mode === 'forgot-password' && 'Reset your password'}
                  </h2>
                </div>

                {mode === 'forgot-password' && (
                  <p className="text-sm text-text-secondary font-light mb-5 leading-relaxed">
                    Enter your email address and we'll send you a secure link to reset your password.
                  </p>
                )}

                {/* Form */}
                <form onSubmit={handleAuth} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="auth-email" className="text-sm font-medium text-text-primary block">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field w-full !pl-10"
                        placeholder="your@email.com"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password (hidden on forgot-password mode) */}
                  {mode !== 'forgot-password' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="auth-password" className="text-sm font-medium text-text-primary block">
                          Password
                        </label>
                        {mode === 'sign-in' && (
                          <button
                            type="button"
                            onClick={() => switchMode('forgot-password')}
                            className="text-xs text-accent hover:text-accent-hover font-medium transition-colors cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                        <input
                          id="auth-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="input-field w-full !pl-10"
                          placeholder={mode === 'sign-up' ? 'Min. 8 characters' : 'Enter your password'}
                          required
                          minLength={mode === 'sign-up' ? 8 : undefined}
                          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <p
                      role="alert"
                      className="text-sm text-center py-2.5 px-4 rounded-lg bg-error-subtle border border-error/20 text-error"
                    >
                      {error}
                    </p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    id="auth-submit-btn"
                    className="btn-primary w-full h-11 text-base mt-1"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading" />
                    ) : (
                      <>
                        {mode === 'sign-in' && 'Sign In'}
                        {mode === 'sign-up' && 'Create Account'}
                        {mode === 'forgot-password' && 'Send Reset Link'}
                      </>
                    )}
                  </button>
                </form>

                {/* Footer toggle */}
                {mode !== 'forgot-password' && (
                  <div className="mt-6 text-center text-sm text-text-secondary">
                    {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
                    <button
                      type="button"
                      onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                      className="text-accent hover:text-accent-hover font-medium transition-colors cursor-pointer"
                    >
                      {mode === 'sign-in' ? 'Sign Up' : 'Sign In'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-text-disabled mt-6 font-light">
          &copy; {new Date().getFullYear()} KhataLens. Built for Chartered Accountants.
        </p>
      </div>
    </div>
  );
}
