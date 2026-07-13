import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const SavedInvoicesPage = lazy(() => import('./pages/SavedInvoicesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const VirtualCfoPage = lazy(() => import('./pages/VirtualCfoPage'));
const CollaborationPortal = lazy(() => import('./pages/CollaborationPortal'));
const SnapPage = lazy(() => import('./pages/SnapPage'));
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
import PlatformAdminLayout from './components/PlatformAdminLayout';
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
      
      if (!session && import.meta.env.DEV && import.meta.env.VITE_DEV_EMAIL && import.meta.env.VITE_DEV_PASSWORD) {
        // Try auto-login in DEV mode
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: import.meta.env.VITE_DEV_EMAIL,
          password: import.meta.env.VITE_DEV_PASSWORD
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/portal/:clientId" element={<CollaborationPortal />} />
            <Route path="/auth" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
            <Route path="/register" element={<AuthPage />} />
            <Route path="/snap/:clientId" element={<SnapPage />} />
            
            {/* Protected Routes */}

            <Route path="/admin" element={<ProtectedRoute><PlatformAdminLayout /></ProtectedRoute>}>
              <Route index element={<PlatformAdminPage />} />
            </Route>

            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="cfo" element={<VirtualCfoPage />} />
              <Route path="invoices" element={<SavedInvoicesPage />} />
              <Route path="reconcile" element={<ReconciliationPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="wallet" element={<WalletPage />} />
            </Route>
            
            {/* Catch-all 404 Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" toastOptions={{
          className: 'backdrop-blur-xl',
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          }
        }} />
      </BrowserRouter>
      </ErrorBoundary>
    </ScanProvider>
    </ClientProvider>
    </QueryClientProvider>
  );
}
