import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Sparkles, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'dev@payforce.com' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'DevPass123!' : '');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Check your email for the login link or log in now if email confirmation is disabled.', { duration: 5000 });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-4 selection:bg-accent-subtle">
      
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 shadow-sm">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">LedgerLens</h1>
          <p className="text-text-secondary">Smart GST Invoice Processing</p>
        </div>

        <div className="card p-8 shadow-md">
          <h2 className="text-xl font-semibold text-text-primary mb-6">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h2>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-disabled" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full pl-10"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-disabled" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full pl-10"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">{error}</p>}
            
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-11 text-base mt-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-text-secondary">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-accent hover:text-accent-hover font-medium transition-colors"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
