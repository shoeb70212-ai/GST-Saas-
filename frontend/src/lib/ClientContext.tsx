import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';

export interface Client {
  id: string;
  user_id: string;
  client_name: string;
  gstin: string;
  pan: string;
  created_at: string;
}

interface ClientContextType {
  clients: Client[];
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  loading: boolean;
  refreshClients: () => Promise<void>;
  credits: number | null;
  refreshCredits: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data: orgData } = await supabase.rpc('get_user_orgs');
      if (orgData && orgData.length > 0) {
        const { data: org } = await supabase.from('organizations').select('credits').eq('id', orgData[0].org_id).single();
        if (org) {
          setCredits(org.credits);
        }
      }
    } catch (e) {
      console.error("Failed to fetch credits", e);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setClients(data);
        // Automatically select the first client if none is selected
        if (data.length > 0 && !activeClientId) {
          // Check if there's a saved preference in localStorage
          const savedId = localStorage.getItem('khatalens_active_client');
          if (savedId && data.find(c => c.id === savedId)) {
            setActiveClientId(savedId);
          } else {
            setActiveClientId(data[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    fetchClients();
    fetchCredits();

    let channel: any;
    const setupRealtime = async () => {
      try {
        const { data: orgData } = await supabase.rpc('get_user_orgs');
        if (orgData && orgData.length > 0) {
          const orgId = orgData[0].org_id;
          channel = supabase
            .channel(`organizations_credits_${orgId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'organizations',
                filter: `id=eq.${orgId}`,
              },
              (payload) => {
                if (payload.new && payload.new.credits !== undefined) {
                  setCredits(payload.new.credits);
                }
              }
            )
            .subscribe();
        }
      } catch (e) {
        console.error("Realtime setup failed:", e);
      }
    };
    
    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchClients, fetchCredits]);

  // Persist active client selection
  useEffect(() => {
    if (activeClientId) {
      localStorage.setItem('khatalens_active_client', activeClientId);
    }
  }, [activeClientId]);

  return (
    <ClientContext.Provider value={{ clients, activeClientId, setActiveClientId, loading, refreshClients: fetchClients, credits, refreshCredits: fetchCredits }}>
      {children}
    </ClientContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClient() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
}
