import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import AuthPage from './pages/AuthPage';
import { ScanProvider } from './lib/ScanContext';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <ScanProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="invoices" element={<div className="p-8 text-white"><h1 className="text-2xl font-bold mb-4">Saved Invoices</h1><p className="text-textMuted">Coming Soon...</p></div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ScanProvider>
  );
}
