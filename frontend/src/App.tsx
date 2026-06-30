import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import AuthPage from './pages/AuthPage';
import SavedInvoicesPage from './pages/SavedInvoicesPage';
import SettingsPage from './pages/SettingsPage';
import ClientsPage from './pages/ClientsPage';
import LandingPage from './pages/LandingPage';
import ReconciliationPage from './pages/ReconciliationPage';
import CollaborationPortal from './pages/CollaborationPortal';
import { ScanProvider } from './lib/ScanContext';
import { ClientProvider } from './lib/ClientContext';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session && import.meta.env.DEV) {
        // Try auto-login in DEV mode
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: 'dev@payforce.com',
          password: 'DevPass123!'
        });
        
        if (signInData?.session) {
          setSession(signInData.session);
        } else {
          setSession(null);
        }
      } else {
        setSession(session);
      }
      setIsInitializing(false);
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!session) {
      return <Navigate to="/auth" replace />;
    }
    return <>{children}</>;
  };

  return (
    <QueryClientProvider client={queryClient}>
    <ClientProvider>
    <ScanProvider>
      <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/portal/:clientId" element={<CollaborationPortal />} />
          <Route path="/auth" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
          
          {/* Protected Routes */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="invoices" element={<SavedInvoicesPage />} />
            <Route path="reconcile" element={<ReconciliationPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          
          {/* Catch-all 404 Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#09090B',
            border: '1px solid #E4E4E7'
          }
        }} />
      </BrowserRouter>
      </ErrorBoundary>
    </ScanProvider>
    </ClientProvider>
    </QueryClientProvider>
  );
}
