import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Sparkles } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        alert('Check your email for the login link or log in now if email confirmation is disabled.');
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-[150px] pointer-events-none" />
      
      <div className="glass-card w-full max-w-md p-8 relative z-10">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            PayForce
          </span>
        </div>
        
        <h2 className="text-xl font-semibold mb-6 text-center">{isSignUp ? 'Create an Account' : 'Welcome Back'}</h2>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-textMuted">Email Address</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-textMuted">Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface/50 border border-white/10 rounded-lg px-4 py-2 focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none"
            />
          </div>
          
          {error && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">{error}</p>}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg py-2.5 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)} 
            className="text-sm text-textMuted hover:text-white transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
