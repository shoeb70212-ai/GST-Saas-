import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AccessCheck = 'super_admin' | 'org_admin';

type RouteAccessGateProps = {
  children: ReactNode;
  check: AccessCheck;
  title?: string;
  message?: string;
  fullPage?: boolean;
};

export function RouteAccessGate({
  children,
  check,
  title = 'Access Restricted',
  message = 'You do not have permission to view this page.',
  fullPage = false,
}: RouteAccessGateProps) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      try {
        if (check === 'super_admin') {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            if (!cancelled) setStatus('denied');
            return;
          }

          const { data, error } = await supabase
            .from('profiles')
            .select('is_super_admin')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!cancelled) {
            setStatus(!error && data?.is_super_admin ? 'allowed' : 'denied');
          }
          return;
        }

        const { data: orgData, error } = await supabase.rpc('get_user_orgs');
        const role = orgData?.[0]?.role;
        if (!cancelled) {
          setStatus(!error && (role === 'owner' || role === 'admin') ? 'allowed' : 'denied');
        }
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [check]);

  if (status === 'loading') {
    const loader = <Loader2 className="w-8 h-8 animate-spin text-accent" />;
    if (fullPage) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50">{loader}</div>;
    }
    return <div className="min-h-[80vh] flex items-center justify-center">{loader}</div>;
  }

  if (status === 'denied') {
    const deniedContent = (
      <>
        <ShieldAlert className="w-16 h-16 text-error opacity-50 mb-4" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">{title}</h1>
        <p className="text-text-secondary mb-6">{message}</p>
        <Link to="/dashboard" className="text-accent font-medium hover:underline">
          Return to Dashboard
        </Link>
      </>
    );

    if (fullPage) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center flex flex-col items-center">
            {deniedContent}
          </div>
        </div>
      );
    }

    return (
      <div className="p-8 max-w-5xl mx-auto flex flex-col items-center justify-center text-center mt-20">
        {deniedContent}
      </div>
    );
  }

  return <>{children}</>;
}

export function SuperAdminGate({ children }: { children: ReactNode }) {
  return (
    <RouteAccessGate
      check="super_admin"
      fullPage
      title="Access Denied"
      message="You do not have platform admin privileges."
    >
      {children}
    </RouteAccessGate>
  );
}

export function OrgAdminGate({ children }: { children: ReactNode }) {
  return (
    <RouteAccessGate
      check="org_admin"
      title="Access Restricted"
      message="Virtual CFO insights are only available to firm owners and admins."
    >
      {children}
    </RouteAccessGate>
  );
}
