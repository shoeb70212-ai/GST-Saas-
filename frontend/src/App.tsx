import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SavedInvoicesPage = lazy(() => import('./pages/SavedInvoicesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const BankStatementsPage = lazy(() => import('./pages/BankStatementsPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const BankReconcilePage = lazy(() => import('./pages/BankReconcilePage'));
const VirtualCfoPage = lazy(() => import('./pages/VirtualCfoPage'));
const TaxLiabilityPage = lazy(() => import('./pages/TaxLiabilityPage'));
const CollaborationPortal = lazy(() => import('./pages/CollaborationPortal'));
const SnapPage = lazy(() => import('./pages/SnapPage'));
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
import PlatformAdminLayout from './components/PlatformAdminLayout';
import ProGate from './components/ProGate';
import { ScanProvider } from './lib/ScanContext';
import { ClientProvider } from './lib/ClientContext';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';

// ProtectedRoute — extracted outside component body to prevent recreation on every render (fixes L3)
const ProtectedRoute = ({ children, session }: { children: React.ReactNode; session: Session | null }) => {
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

// 404 Not Found page — proper UX instead of silent redirect (fixes L4)
const NotFoundPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
    <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
    <p className="text-lg text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
    <a href="/" className="px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
      Go Home
    </a>
  </div>
);

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
      setSession(session);
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
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/portal/:clientId" element={<CollaborationPortal />} />
            <Route path="/auth" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
            <Route path="/register" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/snap/:clientId" element={<SnapPage />} />
            
            {/* Protected Routes */}

            <Route path="/admin" element={<ProtectedRoute session={session}><PlatformAdminLayout /></ProtectedRoute>}>
              <Route index element={<PlatformAdminPage />} />
            </Route>

            <Route path="/" element={<ProtectedRoute session={session}><Layout /></ProtectedRoute>}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="cfo" element={<ProGate><VirtualCfoPage /></ProGate>} />
              <Route path="tax-liability" element={<ProGate><TaxLiabilityPage /></ProGate>} />
              <Route path="invoices" element={<SavedInvoicesPage />} />
              <Route path="bank-statements" element={<BankStatementsPage />} />
              <Route path="bank-reconcile" element={<BankReconcilePage />} />
              <Route path="reconcile" element={<ReconciliationPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="wallet" element={<WalletPage />} />
            </Route>
            
            {/* Catch-all 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
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
