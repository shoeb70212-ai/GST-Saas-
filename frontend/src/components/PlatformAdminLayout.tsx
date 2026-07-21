import { Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, ShieldAlert, Activity, Menu, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../lib/api';

export default function PlatformAdminLayout() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const alertsQuery = useQuery({
    queryKey: ['admin', 'alerts-status'],
    queryFn: async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.access_token) throw new Error('Not signed in');
      const res = await fetch(`${getApiUrl()}/api/admin/alerts/status`, {
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load alert status');
      return res.json() as Promise<{
        healthy: boolean;
        error_count_15m: number;
        threshold: number;
      }>;
    },
    retry: 1,
    refetchInterval: 60_000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const healthy = alertsQuery.data?.healthy !== false;
  const errCount = alertsQuery.data?.error_count_15m ?? 0;

  const statusBlock = (
    <div className={`flex items-center gap-2 ${healthy ? 'text-success' : 'text-error'}`}>
      <span className="relative flex h-2 w-2">
        {healthy ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
        )}
      </span>
      {healthy ? <Activity className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      <span className="text-sm font-medium text-text-secondary">
        {alertsQuery.isError
          ? 'Status: Unknown'
          : healthy
            ? 'Status: All Systems Normal'
            : `Status: Error spike (${errCount} in 15m)`}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <nav className="glass-header sticky top-0 z-50 bg-bg-surface/95 backdrop-blur-sm">
        <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-3">
              <div className="bg-accent p-1.5 rounded-md">
                <ShieldAlert className="w-5 h-5 text-text-inverse" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-text-primary hidden sm:block">
                KhataLens Admin
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-5">
              {statusBlock}
              <div className="w-px h-5 bg-border" />
              <div className="text-sm font-medium text-text-primary">{session?.user?.email}</div>
              <button
                type="button"
                onClick={handleLogout}
                className="btn-ghost h-9 text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>

            <div className="sm:hidden flex items-center">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-text-secondary hover:text-text-primary p-2"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="sm:hidden bg-bg-surface border-b border-border">
          <div className="px-4 pt-2 pb-4 space-y-1">
            <div className="px-3 py-2">{statusBlock}</div>
            <div className="px-3 py-2 text-sm text-text-secondary">{session?.user?.email}</div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full btn-ghost justify-start"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-content mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
