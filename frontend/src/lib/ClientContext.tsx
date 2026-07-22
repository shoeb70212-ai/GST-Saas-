import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';

export interface Client {
  id: string;
  user_id: string;
  org_id?: string;
  client_name: string;
  gstin: string;
  pan: string;
  created_at: string;
}

export interface OrgMembership {
  org_id: string;
  role: string;
  name: string;
}

interface ClientContextType {
  clients: Client[];
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  loading: boolean;
  refreshClients: () => Promise<void>;
  credits: number | null;
  refreshCredits: () => Promise<void>;
  orgs: OrgMembership[];
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string) => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

async function persistActiveOrgId(userId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ active_org_id: orgId })
    .eq('id', userId);
  if (error) {
    console.error('Failed to persist active_org_id', error);
    throw error;
  }
}

function readSavedClientId(): string | null {
  try {
    return localStorage.getItem('khatalens_active_client');
  } catch {
    return null;
  }
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  // Hydrate from localStorage so Dashboard does not flash the welcome/create UI on reload.
  const [activeClientId, setActiveClientIdState] = useState<string | null>(() => readSavedClientId());
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  const resolveActiveOrg = useCallback(async (userId: string): Promise<string | null> => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('active_org_id')
      .eq('id', userId)
      .maybeSingle();

    const { data: orgRows } = await supabase.rpc('get_user_orgs');
    const memberships: { org_id: string; role: string }[] = orgRows ?? [];

    let namesById: Record<string, string> = {};
    if (memberships.length > 0) {
      const ids = memberships.map((m) => m.org_id);
      const { data: orgDetails } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', ids);
      namesById = Object.fromEntries((orgDetails ?? []).map((o) => [o.id, o.name || 'Firm']));
    }

    const nextOrgs: OrgMembership[] = memberships.map((m) => ({
      org_id: m.org_id,
      role: m.role,
      name: namesById[m.org_id] || 'Firm',
    }));
    setOrgs(nextOrgs);

    const membershipIds = new Set(memberships.map((m) => m.org_id));
    let resolved = profile?.active_org_id as string | null | undefined;

    // Drop stale active_org_id if user is no longer a member
    if (resolved && !membershipIds.has(resolved)) {
      resolved = null;
    }

    if (!resolved && memberships.length > 0) {
      resolved = memberships[0].org_id;
      try {
        await persistActiveOrgId(userId, resolved);
      } catch {
        // Keep local resolution even if heal write fails
      }
    }

    setActiveOrgIdState(resolved ?? null);
    return resolved ?? null;
  }, []);

  const fetchCredits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const orgId = await resolveActiveOrg(session.user.id);
      if (!orgId) {
        setCredits(null);
        return;
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('credits')
        .eq('id', orgId)
        .single();
      if (org) {
        setCredits(org.credits);
      }
    } catch (e) {
      console.error('Failed to fetch credits', e);
    }
  }, [resolveActiveOrg]);

  const setActiveOrgId = useCallback(async (orgId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await persistActiveOrgId(session.user.id, orgId);
    setActiveOrgIdState(orgId);

    const { data: org } = await supabase
      .from('organizations')
      .select('credits')
      .eq('id', orgId)
      .single();
    if (org) {
      setCredits(org.credits);
    }

    // Prefer a client in the newly selected firm when possible
    setClients((prev) => {
      const inOrg = prev.filter((c) => c.org_id === orgId);
      if (inOrg.length > 0) {
        const savedId = localStorage.getItem('khatalens_active_client');
        const pick =
          (savedId && inOrg.find((c) => c.id === savedId)) || inOrg[0];
        setActiveClientIdState(pick.id);
      }
      return prev;
    });
  }, []);

  const setActiveClientId = useCallback((id: string | null) => {
    setActiveClientIdState(id);
    if (!id) return;

    void (async () => {
      const client = clients.find((c) => c.id === id);
      const orgId = client?.org_id;
      if (!orgId || orgId === activeOrgId) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await persistActiveOrgId(session.user.id, orgId);
        setActiveOrgIdState(orgId);
        const { data: org } = await supabase
          .from('organizations')
          .select('credits')
          .eq('id', orgId)
          .single();
        if (org) setCredits(org.credits);
      } catch (e) {
        console.error('Failed to sync active_org_id from client', e);
      }
    })();
  }, [clients, activeOrgId]);

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
        // Heal selection: keep current/saved if still visible, else first client, else clear.
        // Prevents stale localStorage IDs and duplicate "Create workspace" clicks while loading.
        setActiveClientIdState((current) => {
          if (data.length === 0) return null;
          if (current && data.some((c) => c.id === current)) return current;
          const savedId = readSavedClientId();
          if (savedId && data.some((c) => c.id === savedId)) return savedId;
          return data[0].id;
        });
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchCredits();
  }, [fetchClients, fetchCredits]);

  // Credit badge realtime — follows profiles.active_org_id
  useEffect(() => {
    if (!activeOrgId) return;
    const channel = supabase
      .channel(`organizations_credits_active_${activeOrgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${activeOrgId}`,
        },
        (payload) => {
          if (payload.new && (payload.new as { credits?: number }).credits !== undefined) {
            setCredits((payload.new as { credits: number }).credits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrgId]);

  // Persist active client selection
  useEffect(() => {
    if (activeClientId) {
      localStorage.setItem('khatalens_active_client', activeClientId);
    }
  }, [activeClientId]);

  return (
    <ClientContext.Provider
      value={{
        clients,
        activeClientId,
        setActiveClientId,
        loading,
        refreshClients: fetchClients,
        credits,
        refreshCredits: fetchCredits,
        orgs,
        activeOrgId,
        setActiveOrgId,
      }}
    >
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
