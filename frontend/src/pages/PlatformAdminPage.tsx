import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  Activity,
  Users,
  FileText,
  IndianRupee,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { ErrorState } from '../components/ui/ErrorState';

type AdminTab = 'overview' | 'ops' | 'tenants';

type OpsEvent = {
  id: string;
  created_at: string;
  severity: string;
  event_type: string;
  channel?: string | null;
  org_id?: string | null;
  user_id?: string | null;
  client_id?: string | null;
  file_name_sanitized?: string | null;
  mime_type?: string | null;
  extraction_state?: string | null;
  confidence_score?: number | null;
  model_used?: string | null;
  tokens_used?: number | null;
  latency_ms?: number | null;
  message?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  org_name?: string | null;
  company_name?: string | null;
  owner_email?: string | null;
  refund_status?: string | null;
  meta?: Record<string, unknown>;
};

type TenantRow = {
  id: string;
  company_name: string;
  email: string;
  credits: number;
  created_at: string;
  invoices_processed: number;
  clients_managed: number;
  suspended_at?: string | null;
  suspend_reason?: string | null;
  org_id?: string | null;
};

type Pagination = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

type HealthSummary = {
  window: string;
  credits: {
    low_balance_orgs: Array<{ org_id: string; name: string; credits: number }>;
    refund_events: number;
    deduct_failed: number;
    low_credit_threshold: number;
  };
  ai: {
    tokens_total: number;
    tokens_per_day_est: number;
    escalate_rate: number;
    estimated_cost_inr: number;
    by_model: Record<string, number>;
  };
  gstin: { miss_rate: number; verify_failures: number; cache_hits: number; cache_misses: number };
  channels: {
    note?: string;
    channels: Record<string, { total: number; errors: number; error_rate: number }>;
  };
  quality: {
    needs_retry_rate: number;
    needs_review_rate: number;
    duplicate_rate: number;
    avg_confidence_score: number | null;
  };
  funnel: {
    orgs_created_per_day: Array<{ date: string; count: number }>;
    zero_client_orgs: Array<{ org_id: string; name: string; owner_id?: string }>;
    zero_invoice_orgs: Array<{ org_id: string; name: string; owner_id?: string }>;
  };
};

const PAGE_SIZE = 25;
const OPS_PAGE_SIZE = 40;

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  return session.access_token;
}

function severityBadge(severity: string) {
  if (severity === 'error') return 'bg-error-subtle text-error';
  if (severity === 'warning') return 'bg-warning-subtle text-warning';
  return 'bg-bg-sunken text-text-secondary';
}

function refundBadge(status?: string | null) {
  if (status === 'refunded') return 'bg-success-subtle text-success';
  if (status === 'deduct_failed' || status === 'refund_failed') return 'bg-error-subtle text-error';
  if (status === 'no_charge') return 'bg-bg-sunken text-text-secondary';
  return 'bg-warning-subtle text-warning';
}

function isTestTenant(t: Pick<TenantRow, 'company_name' | 'email'>) {
  const email = (t.email || '').toLowerCase();
  const company = (t.company_name || '').toLowerCase();
  return email.includes('khatalens-test.com') || company.includes('khatalens-test');
}

const PlatformAdminPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('overview');

  const [opsSeverity, setOpsSeverity] = useState('error');
  const [opsChannel, setOpsChannel] = useState('');
  const [opsResolved, setOpsResolved] = useState<'open' | 'resolved' | 'all'>('open');
  const [opsOffset, setOpsOffset] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);

  const [healthWindow, setHealthWindow] = useState('24h');

  const [tenantSearchInput, setTenantSearchInput] = useState('');
  const [tenantQ, setTenantQ] = useState('');
  const [hideTestTenants, setHideTestTenants] = useState(true);
  const [tenantOffset, setTenantOffset] = useState(0);

  const [creditModal, setCreditModal] = useState<TenantRow | null>(null);
  const [creditDelta, setCreditDelta] = useState('10');
  const [creditNote, setCreditNote] = useState('');
  const [suspendModal, setSuspendModal] = useState<TenantRow | null>(null);
  const [suspendReason, setSuspendReason] = useState('other');
  const [suspendNote, setSuspendNote] = useState('');
  const [bulkPreview, setBulkPreview] = useState<{ count: number; candidates: unknown[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const metricsQuery = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(`${getApiUrl()}/api/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load metrics. You may not be authorized.');
      const body = await res.json();
      return body.metrics as {
        total_invoices: number;
        estimated_cost_inr: number | string;
        estimated_cost_source?: string;
        ai_tokens_24h?: number;
        active_tenants: number;
        total_clients: number;
      };
    },
    retry: 1,
  });

  const healthQuery = useQuery({
    queryKey: ['admin', 'health-summary', healthWindow],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(
        `${getApiUrl()}/api/admin/health-summary?window=${encodeURIComponent(healthWindow)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load health summary.');
      const body = await res.json();
      return body.health as HealthSummary;
    },
    retry: 1,
    enabled: tab === 'overview',
  });

  const opsQuery = useQuery({
    queryKey: ['admin', 'ops-events', opsSeverity, opsChannel, opsResolved, opsOffset],
    queryFn: async () => {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        limit: String(OPS_PAGE_SIZE),
        offset: String(opsOffset),
        resolved: opsResolved,
      });
      if (opsSeverity) params.set('severity', opsSeverity);
      if (opsChannel) params.set('channel', opsChannel);
      const res = await fetch(`${getApiUrl()}/api/admin/ops-events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load ops events.');
      const body = await res.json();
      return {
        events: (body.events || []) as OpsEvent[],
        pagination: body.pagination as Pagination,
      };
    },
    retry: 1,
    enabled: tab === 'ops' || tab === 'overview',
  });

  const eventDetailQuery = useQuery({
    queryKey: ['admin', 'ops-event', selectedEventId],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(`${getApiUrl()}/api/admin/ops-events/${selectedEventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load event detail.');
      const body = await res.json();
      return body.event as OpsEvent;
    },
    retry: 1,
    enabled: !!selectedEventId,
  });

  const tenantsQuery = useQuery({
    queryKey: ['admin', 'tenants', tenantQ, hideTestTenants, tenantOffset],
    queryFn: async () => {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(tenantOffset),
        exclude_test: hideTestTenants ? 'true' : 'false',
      });
      if (tenantQ) params.set('q', tenantQ);
      const res = await fetch(`${getApiUrl()}/api/admin/tenants?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load tenants. You may not be authorized.');
      const body = await res.json();
      return {
        tenants: (body.tenants || []) as TenantRow[],
        pagination: body.pagination as Pagination,
      };
    },
    retry: 1,
    enabled: tab === 'tenants' || tab === 'overview',
  });

  const displayedTenants = useMemo(() => {
    const rows = tenantsQuery.data?.tenants || [];
    if (!hideTestTenants) return rows;
    return rows.filter((t) => !isTestTenant(t));
  }, [tenantsQuery.data?.tenants, hideTestTenants]);

  const recentOpsPreview = useMemo(
    () => (opsQuery.data?.events || []).slice(0, 5),
    [opsQuery.data?.events],
  );

  const applyTenantSearch = useCallback(() => {
    setTenantOffset(0);
    setTenantQ(tenantSearchInput.trim());
  }, [tenantSearchInput]);

  const openEvent = (id: string) => {
    setSelectedEventId(id);
    setResolveNote('');
    if (tab !== 'ops') setTab('ops');
  };

  const submitResolve = async () => {
    if (!selectedEventId) return;
    setResolveBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${getApiUrl()}/api/admin/ops-events/${selectedEventId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: resolveNote }),
      });
      if (!res.ok) throw new Error('Resolve failed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ops-events'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ops-event', selectedEventId] });
      setSelectedEventId(null);
    } catch (e) {
      alert((e as Error).message || 'Resolve failed');
    } finally {
      setResolveBusy(false);
    }
  };

  const submitReopen = async () => {
    if (!selectedEventId) return;
    setResolveBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${getApiUrl()}/api/admin/ops-events/${selectedEventId}/reopen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Reopen failed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ops-events'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ops-event', selectedEventId] });
    } catch (e) {
      alert((e as Error).message || 'Reopen failed');
    } finally {
      setResolveBusy(false);
    }
  };

  const handleAction = async (action: string, t: TenantRow) => {
    const token = await getAccessToken();
    const apiUrl = getApiUrl();

    if (action === 'credits') {
      setCreditModal(t);
      setCreditDelta('10');
      setCreditNote('');
      return;
    }
    if (action === 'suspend') {
      setSuspendModal(t);
      setSuspendReason('other');
      setSuspendNote('');
      return;
    }
    if (action === 'unsuspend') {
      const note = prompt('Unsuspend note (required):', 'Restored after review');
      if (!note || note.trim().length < 3) return;
      const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (res.ok) void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      else alert('Failed to unsuspend');
      return;
    }
    if (action === 'impersonate') {
      if (!confirm(`Open ${t.company_name} as read-only support session?`)) return;
      const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert('Impersonate failed');
        return;
      }
      const body = await res.json();
      const url = body.support_enter_url || body.action_link;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else alert('No magic link returned');
      return;
    }
    if (action === 'profile') {
      const newName = prompt(`Enter new company name for ${t.email}:`, t.company_name);
      if (newName && newName.trim() !== '') {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/profile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_name: newName.trim() }),
        });
        if (res.ok) void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
        else alert('Failed to update profile');
      }
      return;
    }
    if (action === 'delete') {
      if (
        confirm(
          `CRITICAL: Permanently delete ${t.company_name} and all their data? This cannot be undone.`,
        )
      ) {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
        else alert('Failed to delete tenant');
      }
    }
  };

  const submitCreditAdjust = async () => {
    if (!creditModal) return;
    const delta = Number(creditDelta);
    if (!delta || Number.isNaN(delta)) {
      alert('Enter a non-zero delta');
      return;
    }
    if (creditNote.trim().length < 5) {
      alert('Note must be at least 5 characters');
      return;
    }
    const token = await getAccessToken();
    const res = await fetch(`${getApiUrl()}/api/admin/tenants/${creditModal.id}/credits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, note: creditNote.trim() }),
    });
    if (res.ok) {
      setCreditModal(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || 'Credit adjust failed');
    }
  };

  const submitSuspend = async () => {
    if (!suspendModal) return;
    if (suspendNote.trim().length < 3) {
      alert('Note required');
      return;
    }
    const token = await getAccessToken();
    const res = await fetch(`${getApiUrl()}/api/admin/tenants/${suspendModal.id}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: suspendReason, note: suspendNote.trim() }),
    });
    if (res.ok) {
      setSuspendModal(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    } else alert('Suspend failed');
  };

  const runBulkArchive = async (dryRun: boolean) => {
    setBulkBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${getApiUrl()}/api/admin/tenants/bulk-archive-tests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_TEST_FIRMS', dry_run: dryRun }),
      });
      if (!res.ok) throw new Error('Bulk archive failed');
      const body = await res.json();
      if (dryRun) {
        setBulkPreview({ count: body.count || 0, candidates: body.candidates || [] });
      } else {
        setBulkPreview(null);
        alert(`Archived/deleted ${body.count || 0} test firms`);
        void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const metrics = metricsQuery.data;
  const health = healthQuery.data;
  const authBlocked =
    metricsQuery.isError &&
    (metricsQuery.error as Error)?.message?.toLowerCase().includes('authorized');

  if (metricsQuery.isLoading && !metricsQuery.data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (authBlocked) {
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <div className="bg-bg-surface border border-border p-8 rounded-card shadow-sm max-w-md w-full text-center">
          <ShieldAlert className="w-16 h-16 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-text-primary mb-2">Access Denied</h1>
          <p className="text-text-secondary mb-6">
            {(metricsQuery.error as Error)?.message || 'You do not have platform admin privileges.'}
          </p>
          <a href="/app/dashboard" className="text-accent font-medium hover:underline">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; hint?: string }[] = [
    { id: 'overview', label: 'Overview' },
    {
      id: 'ops',
      label: 'Ops Events',
      hint:
        opsQuery.data?.pagination?.total != null
          ? String(opsQuery.data.pagination.total)
          : undefined,
    },
    { id: 'tenants', label: 'Tenants' },
  ];

  const detail = eventDetailQuery.data;

  return (
    <div className="space-y-6 px-2 sm:px-0 relative">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="bg-accent p-3 rounded-card shrink-0">
          <ShieldAlert className="w-6 h-6 text-text-inverse" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Platform Admin</h1>
          <p className="text-text-secondary text-sm">
            Ops triage, health signals, and tenant tooling.
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-1 border-b border-border"
        role="tablist"
        aria-label="Admin sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
            {t.hint != null && (
              <span className="ml-2 text-xs font-mono text-text-disabled">{t.hint}</span>
            )}
          </button>
        ))}
      </div>

      {(tab === 'overview' || tab === 'ops') && (
        <>
          {tab === 'overview' && (
            <section className="space-y-4">
              {metricsQuery.isError ? (
                <ErrorState
                  title="Could not load metrics"
                  message={(metricsQuery.error as Error)?.message}
                  onRetry={() => void metricsQuery.refetch()}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    icon={<FileText className="w-5 h-5" />}
                    label="Total Invoices"
                    value={String(metrics?.total_invoices ?? 0)}
                    sub="Processed globally"
                    tone="gst"
                  />
                  <MetricCard
                    icon={<IndianRupee className="w-5 h-5" />}
                    label="Est. API Cost"
                    value={`₹ ${metrics?.estimated_cost_inr ?? '0.00'}`}
                    sub={
                      metrics?.estimated_cost_source === 'ops_tokens'
                        ? `From ops tokens (${metrics?.ai_tokens_24h ?? 0} tok / 24h)`
                        : 'Fallback ~₹0.06 per invoice'
                    }
                    tone="success"
                  />
                  <MetricCard
                    icon={<Users className="w-5 h-5" />}
                    label="Active CA Firms"
                    value={String(metrics?.active_tenants ?? 0)}
                    sub="Tenants using the platform"
                    tone="accent"
                  />
                  <MetricCard
                    icon={<Activity className="w-5 h-5" />}
                    label="Total End-Clients"
                    value={String(metrics?.total_clients ?? 0)}
                    sub="Managed by CA firms"
                    tone="warning"
                  />
                </div>
              )}

              <div className="bg-bg-surface border border-border rounded-card shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-display font-bold text-text-primary">Ops Health</h2>
                  <select
                    className="input-field h-9 text-sm min-w-[100px]"
                    value={healthWindow}
                    onChange={(e) => setHealthWindow(e.target.value)}
                  >
                    <option value="24h">24h</option>
                    <option value="7d">7d</option>
                  </select>
                </div>
                {healthQuery.isError ? (
                  <ErrorState
                    title="Health summary unavailable"
                    message={(healthQuery.error as Error)?.message}
                    onRetry={() => void healthQuery.refetch()}
                  />
                ) : healthQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : health ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <HealthStat
                        label="Low wallets"
                        value={String(health.credits.low_balance_orgs.length)}
                        sub={`< ${health.credits.low_credit_threshold} credits`}
                      />
                      <HealthStat
                        label="Refunds"
                        value={String(health.credits.refund_events)}
                        sub="Ops-marked refunds"
                      />
                      <HealthStat
                        label="Deduct fails"
                        value={String(health.credits.deduct_failed)}
                        sub="credit_deduct_failed"
                      />
                      <HealthStat
                        label="Escalate rate"
                        value={`${((health.ai.escalate_rate || 0) * 100).toFixed(1)}%`}
                        sub={`${health.ai.tokens_total} tokens`}
                      />
                      <HealthStat
                        label="GSTIN miss %"
                        value={`${((health.gstin.miss_rate || 0) * 100).toFixed(1)}%`}
                        sub={`${health.gstin.verify_failures} verify fails`}
                      />
                      <HealthStat
                        label="Needs retry"
                        value={`${((health.quality.needs_retry_rate || 0) * 100).toFixed(1)}%`}
                        sub={`dup ${((health.quality.duplicate_rate || 0) * 100).toFixed(1)}%`}
                      />
                      <HealthStat
                        label="AI cost (ops)"
                        value={`₹ ${health.ai.estimated_cost_inr}`}
                        sub={`${Math.round(health.ai.tokens_per_day_est)} tok/day est`}
                      />
                      <HealthStat
                        label="Avg confidence"
                        value={
                          health.quality.avg_confidence_score != null
                            ? String(health.quality.avg_confidence_score)
                            : '—'
                        }
                        sub="From ops scores"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary mb-2">
                        {health.channels.note || 'Channel mix (ops-weighted)'}
                      </p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {Object.entries(health.channels.channels || {}).map(([ch, s]) => (
                          <div
                            key={ch}
                            className="border border-border rounded-md px-3 py-2 text-sm"
                          >
                            <div className="font-medium capitalize">{ch}</div>
                            <div className="text-text-secondary text-xs">
                              {s.total} events · {(s.error_rate * 100).toFixed(0)}% err
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {(health.funnel.zero_client_orgs.length > 0 ||
                      health.credits.low_balance_orgs.length > 0) && (
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h3 className="font-medium mb-2">Low wallets</h3>
                          <ul className="space-y-1 max-h-40 overflow-auto">
                            {health.credits.low_balance_orgs.slice(0, 8).map((o) => (
                              <li key={o.org_id} className="flex justify-between gap-2">
                                <button
                                  type="button"
                                  className="text-accent hover:underline text-left truncate"
                                  onClick={() => {
                                    setTab('tenants');
                                    setTenantSearchInput(o.name);
                                    setTenantQ(o.name);
                                  }}
                                >
                                  {o.name}
                                </button>
                                <span className="font-mono text-xs">{o.credits}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h3 className="font-medium mb-2">Zero-client orgs</h3>
                          <ul className="space-y-1 max-h-40 overflow-auto">
                            {health.funnel.zero_client_orgs.slice(0, 8).map((o) => (
                              <li key={o.org_id}>
                                <button
                                  type="button"
                                  className="text-accent hover:underline text-left truncate"
                                  onClick={() => {
                                    setTab('tenants');
                                    setTenantSearchInput(o.name);
                                    setTenantQ(o.name);
                                  }}
                                >
                                  {o.name}
                                </button>
                              </li>
                            ))}
                            {health.funnel.zero_client_orgs.length === 0 && (
                              <li className="text-text-secondary">None in sample</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="bg-bg-surface border border-border rounded-card shadow-sm p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-warning" />
                    <h2 className="text-lg font-display font-bold text-text-primary">
                      Recent Ops Events
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-sm h-9"
                    onClick={() => setTab('ops')}
                  >
                    View all
                  </button>
                </div>
                {opsQuery.isError ? (
                  <ErrorState
                    title="Ops events unavailable"
                    message={(opsQuery.error as Error)?.message}
                    onRetry={() => void opsQuery.refetch()}
                  />
                ) : opsQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : recentOpsPreview.length === 0 ? (
                  <p className="text-sm text-text-secondary py-4">
                    No open error events. Adjust filters on the Ops tab.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {recentOpsPreview.map((ev) => (
                      <li key={ev.id}>
                        <button
                          type="button"
                          className="w-full py-3 flex flex-wrap items-start gap-3 text-sm text-left hover:bg-bg-sunken/50 rounded-md px-1"
                          onClick={() => openEvent(ev.id)}
                        >
                          <span className={`badge ${severityBadge(ev.severity)}`}>{ev.severity}</span>
                          <span className="font-medium text-text-primary">{ev.event_type}</span>
                          <span className="text-text-secondary">{ev.channel || '—'}</span>
                          <span className="text-text-disabled text-xs ml-auto whitespace-nowrap">
                            {ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}
                          </span>
                          <p className="w-full text-xs text-text-secondary truncate" title={ev.message || ''}>
                            {ev.message || '—'}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {tab === 'ops' && (
            <section className="bg-bg-surface border border-border rounded-card shadow-sm p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-warning" />
                    <h2 className="text-xl font-display font-bold text-text-primary">
                      Extraction Ops Events
                    </h2>
                  </div>
                  <p className="text-sm text-text-secondary mt-1">
                    Click a row for firm context, refund status, and resolve.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary h-9 text-sm"
                  onClick={() => void opsQuery.refetch()}
                  disabled={opsQuery.isFetching}
                >
                  <RefreshCw className={`w-4 h-4 ${opsQuery.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm space-y-1">
                  <span className="text-text-secondary">Resolved</span>
                  <select
                    className="input-field block min-w-[140px]"
                    value={opsResolved}
                    onChange={(e) => {
                      setOpsOffset(0);
                      setOpsResolved(e.target.value as 'open' | 'resolved' | 'all');
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-text-secondary">Severity</span>
                  <select
                    className="input-field block min-w-[140px]"
                    value={opsSeverity}
                    onChange={(e) => {
                      setOpsOffset(0);
                      setOpsSeverity(e.target.value);
                    }}
                  >
                    <option value="">All</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-text-secondary">Channel</span>
                  <select
                    className="input-field block min-w-[140px]"
                    value={opsChannel}
                    onChange={(e) => {
                      setOpsOffset(0);
                      setOpsChannel(e.target.value);
                    }}
                  >
                    <option value="">All</option>
                    <option value="scan">Scan</option>
                    <option value="batch">Batch</option>
                    <option value="public">Public</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </label>
              </div>

              {opsQuery.isError ? (
                <ErrorState
                  title="Could not load ops events"
                  message={(opsQuery.error as Error)?.message}
                  onRetry={() => void opsQuery.refetch()}
                />
              ) : opsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-7 h-7 animate-spin text-accent" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="table-header">When</th>
                          <th className="table-header">Severity</th>
                          <th className="table-header">Type</th>
                          <th className="table-header">Channel</th>
                          <th className="table-header">State / Score</th>
                          <th className="table-header">Model</th>
                          <th className="table-header">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(opsQuery.data?.events || []).length === 0 ? (
                          <tr>
                            <td className="py-6 text-sm text-center text-text-secondary" colSpan={7}>
                              No ops events match these filters.
                            </td>
                          </tr>
                        ) : (
                          (opsQuery.data?.events || []).map((ev) => (
                            <tr
                              key={ev.id}
                              className="table-row align-top cursor-pointer hover:bg-bg-sunken/40"
                              onClick={() => openEvent(ev.id)}
                            >
                              <td className="table-cell-custom text-xs text-text-secondary whitespace-nowrap">
                                {ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="table-cell-custom">
                                <span className={`badge ${severityBadge(ev.severity)}`}>
                                  {ev.severity}
                                </span>
                              </td>
                              <td className="table-cell-custom font-medium">{ev.event_type}</td>
                              <td className="table-cell-custom text-text-secondary">
                                {ev.channel || '—'}
                              </td>
                              <td className="table-cell-custom text-text-secondary">
                                {ev.extraction_state || '—'}
                                {ev.confidence_score != null ? ` · ${ev.confidence_score}` : ''}
                              </td>
                              <td
                                className="table-cell-custom text-xs text-text-secondary max-w-[140px] truncate"
                                title={ev.model_used || ''}
                              >
                                {ev.model_used || '—'}
                              </td>
                              <td
                                className="table-cell-custom text-xs text-text-secondary max-w-[280px] truncate"
                                title={ev.message || ''}
                              >
                                {ev.message || '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    offset={opsOffset}
                    limit={OPS_PAGE_SIZE}
                    total={opsQuery.data?.pagination?.total ?? 0}
                    hasMore={opsQuery.data?.pagination?.has_more ?? false}
                    onPrev={() => setOpsOffset((o) => Math.max(0, o - OPS_PAGE_SIZE))}
                    onNext={() => setOpsOffset((o) => o + OPS_PAGE_SIZE)}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'tenants' && (
        <section className="bg-bg-surface border border-border rounded-card shadow-sm p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-display font-bold text-text-primary">
                Tenant Quota Management
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                Adjust credits with audit trail, suspend with reason, open read-only support.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary h-9 text-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkArchive(true)}
            >
              Clean test firms…
            </button>
          </div>

          {bulkPreview && (
            <div className="border border-warning/40 bg-warning-subtle/40 rounded-md p-4 text-sm space-y-2">
              <p>
                Dry-run found <strong>{bulkPreview.count}</strong> test firms (max 50).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary h-9 text-sm"
                  disabled={bulkBusy || bulkPreview.count === 0}
                  onClick={() => {
                    if (
                      confirm(
                        `Permanently archive/delete ${bulkPreview.count} test firms? Type confirm was already sent as DELETE_TEST_FIRMS.`,
                      )
                    ) {
                      void runBulkArchive(false);
                    }
                  }}
                >
                  Confirm delete
                </button>
                <button type="button" className="btn-ghost h-9 text-sm" onClick={() => setBulkPreview(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex flex-1 gap-2 min-w-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
                <input
                  type="search"
                  className="input-field w-full pl-9"
                  placeholder="Search company or email…"
                  value={tenantSearchInput}
                  onChange={(e) => setTenantSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyTenantSearch();
                  }}
                />
              </div>
              <button type="button" className="btn-primary h-10 shrink-0" onClick={applyTenantSearch}>
                Search
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                className="rounded border-border text-accent focus:ring-accent"
                checked={hideTestTenants}
                onChange={(e) => {
                  setTenantOffset(0);
                  setHideTestTenants(e.target.checked);
                }}
              />
              Hide test tenants
            </label>
          </div>

          {tenantsQuery.isError ? (
            <ErrorState
              title="Could not load tenants"
              message={(tenantsQuery.error as Error)?.message}
              onRetry={() => void tenantsQuery.refetch()}
            />
          ) : tenantsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-accent" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr>
                      <th className="table-header">Company</th>
                      <th className="table-header">Email</th>
                      <th className="table-header">Signup</th>
                      <th className="table-header text-center">Clients</th>
                      <th className="table-header text-center">Invoices</th>
                      <th className="table-header text-center">Quota</th>
                      <th className="table-header text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTenants.length === 0 ? (
                      <tr>
                        <td className="py-6 text-sm text-center text-text-secondary" colSpan={7}>
                          No tenants match. Try clearing search or showing test tenants.
                        </td>
                      </tr>
                    ) : (
                      displayedTenants.map((t) => (
                        <tr key={t.id} className="table-row">
                          <td className="table-cell-custom font-medium">
                            {t.company_name}
                            {t.suspended_at && (
                              <span className="ml-2 badge bg-error-subtle text-error text-xs">
                                Suspended
                              </span>
                            )}
                          </td>
                          <td className="table-cell-custom text-text-secondary text-sm">{t.email}</td>
                          <td className="table-cell-custom text-text-secondary text-sm">
                            {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="table-cell-custom text-center">{t.clients_managed || 0}</td>
                          <td className="table-cell-custom text-center">{t.invoices_processed}</td>
                          <td className="table-cell-custom text-center">
                            <span className="badge bg-accent-subtle text-accent">
                              {t.credits} left
                            </span>
                          </td>
                          <td className="table-cell-custom text-right">
                            <select
                              aria-label={`Actions for ${t.company_name}`}
                              onChange={(e) => {
                                if (e.target.value) {
                                  void handleAction(e.target.value, t);
                                  e.target.value = '';
                                }
                              }}
                              className="input-field h-9 text-sm cursor-pointer text-accent font-medium min-w-[160px]"
                              defaultValue=""
                            >
                              <option value="" disabled hidden>
                                Actions…
                              </option>
                              <option value="credits">Adjust Credits</option>
                              {t.suspended_at ? (
                                <option value="unsuspend">Unsuspend</option>
                              ) : (
                                <option value="suspend">Suspend…</option>
                              )}
                              <option value="impersonate">Open as firm (read-only)</option>
                              <option value="profile">Edit Profile</option>
                              <option value="delete">Delete Tenant</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                offset={tenantOffset}
                limit={PAGE_SIZE}
                total={tenantsQuery.data?.pagination?.total ?? 0}
                hasMore={tenantsQuery.data?.pagination?.has_more ?? false}
                onPrev={() => setTenantOffset((o) => Math.max(0, o - PAGE_SIZE))}
                onNext={() => setTenantOffset((o) => o + PAGE_SIZE)}
              />
            </>
          )}
        </section>
      )}

      {/* Ops event drawer */}
      {selectedEventId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
          <button
            type="button"
            className="flex-1 cursor-default"
            aria-label="Close drawer"
            onClick={() => setSelectedEventId(null)}
          />
          <aside className="w-full max-w-md bg-bg-surface border-l border-border shadow-lg h-full overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-display font-bold">Ops event</h3>
              <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={() => setSelectedEventId(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {eventDetailQuery.isError ? (
              <ErrorState
                title="Could not load event"
                message={(eventDetailQuery.error as Error)?.message}
                onRetry={() => void eventDetailQuery.refetch()}
              />
            ) : eventDetailQuery.isLoading || !detail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${severityBadge(detail.severity)}`}>{detail.severity}</span>
                  <span className={`badge ${refundBadge(detail.refund_status)}`}>
                    refund: {detail.refund_status || 'unknown'}
                  </span>
                  {detail.resolved_at && (
                    <span className="badge bg-success-subtle text-success">resolved</span>
                  )}
                </div>
                <dl className="text-sm space-y-2">
                  <Row label="Type" value={detail.event_type} />
                  <Row label="Channel" value={detail.channel || '—'} />
                  <Row label="Firm" value={detail.org_name || detail.company_name || 'Unknown firm'} />
                  <Row label="Email" value={detail.owner_email || '—'} />
                  <Row label="Client id" value={detail.client_id || '—'} />
                  <Row label="Model" value={detail.model_used || '—'} />
                  <Row label="Tokens" value={detail.tokens_used != null ? String(detail.tokens_used) : '—'} />
                  <Row
                    label="State"
                    value={
                      `${detail.extraction_state || '—'}${
                        detail.confidence_score != null ? ` · ${detail.confidence_score}` : ''
                      }`
                    }
                  />
                  <Row label="Message" value={detail.message || '—'} />
                  {detail.resolution_note && (
                    <Row label="Resolution" value={detail.resolution_note} />
                  )}
                </dl>
                {!detail.resolved_at ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <label className="text-sm block space-y-1">
                      <span className="text-text-secondary">Resolve note</span>
                      <textarea
                        className="input-field w-full min-h-[80px]"
                        maxLength={1000}
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="What fixed it / follow-up…"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      disabled={resolveBusy}
                      onClick={() => void submitResolve()}
                    >
                      Mark resolved
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    disabled={resolveBusy}
                    onClick={() => void submitReopen()}
                  >
                    Reopen
                  </button>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {/* Credit adjust modal */}
      {creditModal && (
        <ModalShell title={`Adjust credits — ${creditModal.company_name}`} onClose={() => setCreditModal(null)}>
          <p className="text-sm text-text-secondary mb-3">Current balance: {creditModal.credits}</p>
          <label className="text-sm block space-y-1 mb-3">
            <span>Delta (+/−)</span>
            <input
              className="input-field w-full"
              value={creditDelta}
              onChange={(e) => setCreditDelta(e.target.value)}
            />
          </label>
          <label className="text-sm block space-y-1 mb-4">
            <span>Note (required, ≥5 chars)</span>
            <textarea
              className="input-field w-full min-h-[70px]"
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setCreditModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void submitCreditAdjust()}>
              Submit
            </button>
          </div>
        </ModalShell>
      )}

      {suspendModal && (
        <ModalShell title={`Suspend — ${suspendModal.company_name}`} onClose={() => setSuspendModal(null)}>
          <label className="text-sm block space-y-1 mb-3">
            <span>Reason</span>
            <select
              className="input-field w-full"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            >
              <option value="nonpayment">Nonpayment</option>
              <option value="abuse">Abuse</option>
              <option value="request">Request</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm block space-y-1 mb-4">
            <span>Note</span>
            <textarea
              className="input-field w-full min-h-[70px]"
              value={suspendNote}
              onChange={(e) => setSuspendNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setSuspendModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void submitSuspend()}>
              Suspend firm
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-text-primary break-words">{value}</dd>
    </div>
  );
}

function HealthStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-border rounded-md px-3 py-2">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-lg font-display font-bold">{value}</div>
      <div className="text-xs text-text-disabled">{sub}</div>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg-surface border border-border rounded-card shadow-lg max-w-md w-full p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'gst' | 'success' | 'accent' | 'warning';
}) {
  const toneClass =
    tone === 'gst'
      ? 'text-gst-cgst'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-accent';

  return (
    <div className="bg-bg-surface border border-border rounded-card shadow-sm p-5">
      <div className={`flex items-center gap-3 mb-3 ${toneClass}`}>
        {icon}
        <h3 className="font-semibold text-text-secondary text-sm">{label}</h3>
      </div>
      <p className="text-3xl font-display font-bold text-text-primary">{value}</p>
      <p className="text-sm text-text-secondary mt-1">{sub}</p>
    </div>
  );
}

function PaginationBar({
  offset,
  limit,
  total,
  hasMore,
  onPrev,
  onNext,
}: {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
      <p className="text-xs text-text-secondary font-mono">
        {total > 0 ? `${from}–${to} of ${total}` : '0 results'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary h-9 px-3 text-sm"
          disabled={offset <= 0}
          onClick={onPrev}
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        <button
          type="button"
          className="btn-secondary h-9 px-3 text-sm"
          disabled={!hasMore}
          onClick={onNext}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default PlatformAdminPage;
