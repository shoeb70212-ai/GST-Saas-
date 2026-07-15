import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (profile?.tier !== 'pro') {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto text-center mt-20">
        <div className="card border-accent/20 bg-accent/5 p-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Pro Feature Locked</h2>
          <p className="text-text-secondary mb-8">
            This feature requires a KhataLens Pro Pass. Upgrade your workspace to unlock the CFO Dashboard, Tax Liability Predictor, and advanced match tolerances.
          </p>
          <button 
            onClick={() => navigate('/dashboard/wallet')}
            className="btn-primary w-max px-8"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
