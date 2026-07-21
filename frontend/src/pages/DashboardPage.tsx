import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign, FileText, Settings, CheckCircle2, TrendingUp, Building2, Briefcase,
  AlertTriangle, ArrowUpRight, ArrowDownRight, ArrowRight, ScanLine, Network, Banknote, Wallet
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useClient } from '../lib/ClientContext';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '../components/ui/Skeleton';
import AnalyticsCharts, { type AnalyticsData, AnalyticsSkeleton } from '../components/AnalyticsCharts';
import { ErrorState } from '../components/ui/ErrorState';
import { formatCurrency } from '../utils/format';

const AVAILABLE_WIDGETS = [
  { key: 'total_taxable', label: 'Total Taxable Amount', icon: DollarSign },
  { key: 'total_cgst', label: 'Total CGST', icon: TrendingUp },
  { key: 'total_sgst', label: 'Total SGST', icon: TrendingUp },
  { key: 'total_igst', label: 'Total IGST', icon: TrendingUp },
  { key: 'total_outstanding', label: 'Total Outstanding', icon: DollarSign },
  { key: 'invoice_count', label: 'Total Invoices Scanned', icon: FileText },
];

const DEFAULT_WIDGETS = ['total_taxable', 'total_cgst', 'total_sgst', 'invoice_count'];

const DEFAULT_METRICS = { totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalOutstanding: 0, invoiceCount: 0 };

const CONTINUE_WORK = [
  { to: '/app/scan', label: 'Scan invoices', hint: 'Extract GST fields from PDFs or photos', icon: ScanLine },
  { to: '/app/invoices', label: 'Review invoices', hint: 'Check flagged fields before export', icon: FileText },
  { to: '/app/reconcile', label: 'Run GSTR-2B match', hint: 'Find unmatched ITC vs purchase books', icon: Network },
  { to: '/app/bank-statements', label: 'Upload bank statement', hint: 'Parse PDF/Excel for payment matching', icon: Banknote },
] as const;

export default function DashboardPage() {
  const { activeClientId, clients, setActiveClientId, credits } = useClient();
  const [showSettings, setShowSettings] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(DEFAULT_WIDGETS);

  const { data: dashboardData, isLoading, isError: isDashboardError, refetch: refetchDashboard } = useQuery({
    queryKey: ['invoices', 'dashboard', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return { metrics: null, recentInvoices: [], needsReview: 0 };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { metrics: null, recentInvoices: [], needsReview: 0 };

      const { data: recent, error: recentError } = await supabase
        .from('invoices')
        .select('id, file_name, supplier_name, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, received_amount, recon_status, processing_status, invoice_date, created_at, confidence_score')
        .eq('client_id', activeClientId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentError) throw recentError;

      const { data: metricsData, error: metricsError } = await supabase.rpc('get_dashboard_metrics', {
        client_id_param: activeClientId,
        user_id_param: session.user.id
      });

      let metrics = { ...DEFAULT_METRICS };

      if (metricsError) {
        console.warn('RPC not found, falling back to client-side limit calculation');
      } else if (metricsData && metricsData.length > 0) {
        const m = metricsData[0];
        metrics = {
          totalTaxable: m.total_taxable_amount || 0,
          totalCgst: m.total_cgst_amount || 0,
          totalSgst: m.total_sgst_amount || 0,
          totalIgst: m.total_igst_amount || 0,
          totalOutstanding: m.total_outstanding || 0,
          invoiceCount: m.invoice_count || 0
        };
      }

      // Lightweight review queue count — confidence filter only, no full table load
      const { count: needsReview } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', activeClientId)
        .lt('confidence_score', 80);

      const { data: clientData } = await supabase.from('clients').select('estimated_monthly_sales, estimated_sales_tax_rate').eq('id', activeClientId).single();

      return { metrics, recentInvoices: recent || [], clientData, needsReview: needsReview ?? 0 };
    },
    enabled: !!activeClientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const {
    data: stripCounts,
    isError: isStripError,
    refetch: refetchStrip,
  } = useQuery({
    queryKey: ['dashboard', 'today-strip', activeClientId],
    queryFn: async () => {
      if (!activeClientId) {
        return { unmatched_2b_count: 0, unmatched_bank_count: 0, has_2b_data: false, has_bank_data: false };
      }
      const { data, error } = await supabase.rpc('get_today_strip_counts', {
        client_id_param: activeClientId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        unmatched_2b_count: Number(row?.unmatched_2b_count ?? 0),
        unmatched_bank_count: Number(row?.unmatched_bank_count ?? 0),
        has_2b_data: Boolean(row?.has_2b_data),
        has_bank_data: Boolean(row?.has_bank_data),
      };
    },
    enabled: !!activeClientId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: analyticsData, isPending: isAnalyticsPending, isError: isAnalyticsError, refetch: refetchAnalytics } = useQuery<AnalyticsData | null>({
    queryKey: ['invoices', 'analytics', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return null;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase.rpc('get_advanced_analytics', {
        client_id_param: activeClientId,
        user_id_param: session.user.id
      });

      if (error) {
        console.error('Failed to fetch advanced analytics:', error);
        return null;
      }
      return data as AnalyticsData;
    },
    enabled: !!activeClientId,
    staleTime: 5 * 60 * 1000,
  });

  const metrics = dashboardData?.metrics || DEFAULT_METRICS;
  const recentInvoices = dashboardData?.recentInvoices || [];
  const needsReview = dashboardData?.needsReview ?? 0;
  const unmatched2b = stripCounts?.unmatched_2b_count ?? 0;
  const unmatchedBank = stripCounts?.unmatched_bank_count ?? 0;
  const has2bData = stripCounts?.has_2b_data ?? false;
  const hasBankData = stripCounts?.has_bank_data ?? false;

  useEffect(() => {
    const saved = localStorage.getItem('khatalens_widgets');
    if (saved) {
      try {
        setVisibleWidgets(JSON.parse(saved));
      } catch (_e) { /* ignore */ }
    }
  }, []);

  const toggleWidget = (key: string) => {
    setVisibleWidgets(prev => {
      const next = prev.includes(key) ? prev.filter(w => w !== key) : [...prev, key];
      localStorage.setItem('khatalens_widgets', JSON.stringify(next));
      return next;
    });
  };

  const getWidgetValue = (key: string) => {
    switch (key) {
      case 'total_taxable': return formatCurrency(metrics.totalTaxable);
      case 'total_cgst': return formatCurrency(metrics.totalCgst);
      case 'total_sgst': return formatCurrency(metrics.totalSgst);
      case 'total_igst': return formatCurrency(metrics.totalIgst);
      case 'total_outstanding': return formatCurrency(metrics.totalOutstanding);
      case 'invoice_count': return metrics.invoiceCount.toString();
      default: return '0';
    }
  };

  const getWidgetTrend = (key: string) => {
    if (!analyticsData?.trends || analyticsData.trends.length < 2) return null;
    const trends = analyticsData.trends;
    const current = trends[trends.length - 1];
    const previous = trends[trends.length - 2];
    if (key === 'invoice_count') return null;
    if (previous.total_taxable === 0) return null;
    return ((current.total_taxable - previous.total_taxable) / previous.total_taxable) * 100;
  };

  if (!activeClientId) {
    return (
      <div className="p-4 md:p-8 max-w-content mx-auto h-[80vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-xl bg-bg-sunken border border-border flex items-center justify-center mb-6">
          <Building2 className="w-8 h-8 text-text-disabled" />
        </div>
        <h2 className="text-2xl font-display font-semibold text-text-primary mb-2">Welcome to KhataLens</h2>
        <p className="text-text-secondary max-w-md mb-8 text-sm leading-relaxed">
          Choose how you will use the desk — multi-client CA practice or a single business workspace.
        </p>

        {clients.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('accountType', 'firm');
                window.location.href = '/app/clients';
              }}
              className="bg-bg-surface border border-border rounded-xl p-6 flex flex-col items-start text-left hover:border-accent transition-colors group"
            >
              <Building2 className="w-5 h-5 text-accent mb-3" />
              <h3 className="text-lg font-display font-semibold text-text-primary mb-1">Accounting firm (CA)</h3>
              <p className="text-sm text-text-secondary mb-5 leading-relaxed">
                Manage invoices, bank statements, and GST recon for multiple clients.
              </p>
              <span className="mt-auto text-accent text-sm font-semibold flex items-center gap-1">
                Set up clients <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                  const { data: orgData } = await supabase.rpc('get_user_orgs');
                  let currentOrgId = null;
                  if (orgData && orgData.length > 0) {
                    currentOrgId = orgData[0].org_id;
                    await supabase.from('profiles').update({ active_org_id: currentOrgId }).eq('id', session.user.id);
                  }

                  const { data, error } = await supabase.from('clients').insert({
                    user_id: session.user.id,
                    org_id: currentOrgId,
                    client_name: 'My Company'
                  }).select().single();
                  if (error) {
                    toast.error(`Failed to create workspace: ${error.message}`);
                  } else if (data) {
                    setActiveClientId(data.id);
                    localStorage.setItem('accountType', 'business');
                  }
                }
              }}
              className="bg-bg-surface border border-border rounded-xl p-6 flex flex-col items-start text-left hover:border-border-focus transition-colors group"
            >
              <Briefcase className="w-5 h-5 text-text-secondary mb-3" />
              <h3 className="text-lg font-display font-semibold text-text-primary mb-1">Single business</h3>
              <p className="text-sm text-text-secondary mb-5 leading-relaxed">
                Manage invoices and reconciliation for your own company only.
              </p>
              <span className="mt-auto text-text-secondary group-hover:text-text-primary text-sm font-semibold flex items-center gap-1">
                Create workspace <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-text-secondary max-w-md mb-6 text-sm">
              Select a workspace from the sidebar to view metrics and invoices.
            </p>
            <Link to="/app/clients" className="btn-primary">
              Manage {localStorage.getItem('accountType') === 'business' ? 'Businesses' : 'Clients'}
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (isDashboardError) {
    return (
      <div className="p-4 md:p-8 max-w-content mx-auto h-[80vh] flex items-center justify-center">
        <ErrorState
          title="Dashboard Failed to Load"
          message="We couldn't retrieve your dashboard metrics. Please check your connection."
          onRetry={refetchDashboard}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-content mx-auto space-y-6 pb-20">
        <Skeleton className="h-8 w-48 mb-2" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-bg-surface border border-border rounded-xl p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <AnalyticsSkeleton />
      </div>
    );
  }

  const lowCredits = credits !== null && credits < 50;
  const has2bAction = has2bData && unmatched2b > 0;
  const hasBankAction = hasBankData && unmatchedBank > 0;

  return (
    <div className="p-4 md:p-6 max-w-content mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-text-primary mb-1">Today</h1>
          <p className="text-sm text-text-secondary">Desk overview for the active client.</p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border flex items-center gap-2"
          >
            <Settings className="w-4 h-4" /> <span className="text-sm font-medium">Customize</span>
          </button>

          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute right-0 top-full mt-2 w-64 bg-bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden"
              >
                <div className="p-3 border-b border-border bg-bg-sunken/50">
                  <h3 className="font-semibold text-text-primary text-sm">Visible metrics</h3>
                </div>
                <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {AVAILABLE_WIDGETS.map(widget => {
                    const isVisible = visibleWidgets.includes(widget.key);
                    return (
                      <button
                        key={widget.key}
                        type="button"
                        onClick={() => toggleWidget(widget.key)}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors',
                          isVisible ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:bg-bg-sunken'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <widget.icon className="w-4 h-4" />
                          <span>{widget.label}</span>
                        </div>
                        {isVisible && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Today strip — 4 KPIs max; copper only when action needed */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          to="/app/wallet"
          className="bg-bg-surface border border-border rounded-xl p-4 hover:border-border-focus transition-colors"
        >
          <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
            <Wallet className="w-3.5 h-3.5" /> Wallet
          </div>
          <p className={cn('text-2xl font-mono font-semibold tracking-tight', lowCredits ? 'text-accent' : 'text-text-primary')}>
            {credits !== null ? credits.toLocaleString('en-IN') : '—'}
          </p>
          <p className="text-xs text-text-secondary mt-1">{lowCredits ? 'Low — top up credits' : 'Credits available'}</p>
        </Link>

        <Link
          to="/app/invoices"
          className="bg-bg-surface border border-border rounded-xl p-4 hover:border-border-focus transition-colors"
        >
          <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
            <FileText className="w-3.5 h-3.5" /> Invoices
          </div>
          <p className="text-2xl font-mono font-semibold text-text-primary tracking-tight">
            {metrics.invoiceCount.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {needsReview > 0 ? `${needsReview} need review` : 'Scanned for this client'}
          </p>
        </Link>

        {isStripError ? (
          <button
            type="button"
            onClick={() => void refetchStrip()}
            className="bg-bg-surface border border-border rounded-xl p-4 text-left hover:border-border-focus transition-colors"
          >
            <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
              <Network className="w-3.5 h-3.5" /> 2B unmatched
            </div>
            <p className="text-sm font-semibold text-text-primary">Could not load count</p>
            <p className="text-xs text-accent mt-1">Retry</p>
          </button>
        ) : (
          <Link
            to="/app/reconcile"
            className="bg-bg-surface border border-border rounded-xl p-4 hover:border-border-focus transition-colors"
          >
            <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
              <Network className="w-3.5 h-3.5" /> 2B unmatched
            </div>
            {!has2bData ? (
              <>
                <p className="text-2xl font-display font-semibold text-text-primary tracking-tight">Upload</p>
                <p className="text-xs text-text-secondary mt-1">No GSTR-2B file yet</p>
              </>
            ) : (
              <>
                <p className={cn('text-2xl font-mono font-semibold tracking-tight', has2bAction ? 'text-accent' : 'text-text-primary')}>
                  {unmatched2b.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  {has2bAction ? 'Mismatch / missing in 2B' : 'All clear for uploaded periods'}
                </p>
              </>
            )}
          </Link>
        )}

        {isStripError ? (
          <Link
            to="/app/bank-reconcile"
            className="bg-bg-surface border border-border rounded-xl p-4 hover:border-border-focus transition-colors"
          >
            <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
              <Banknote className="w-3.5 h-3.5" /> Bank unmatched
            </div>
            <p className="text-sm font-semibold text-text-primary">Open bank match</p>
            <p className="text-xs text-text-secondary mt-1">Count unavailable</p>
          </Link>
        ) : (
          <Link
            to={hasBankData ? '/app/bank-reconcile' : '/app/bank-statements'}
            className="bg-bg-surface border border-border rounded-xl p-4 hover:border-border-focus transition-colors"
          >
            <div className="flex items-center gap-1.5 text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
              <Banknote className="w-3.5 h-3.5" /> Bank unmatched
            </div>
            {!hasBankData ? (
              <>
                <p className="text-2xl font-display font-semibold text-text-primary tracking-tight">Upload</p>
                <p className="text-xs text-text-secondary mt-1">No bank statement yet</p>
              </>
            ) : (
              <>
                <p className={cn('text-2xl font-mono font-semibold tracking-tight', hasBankAction ? 'text-accent' : 'text-text-primary')}>
                  {unmatchedBank.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  {hasBankAction ? 'Withdrawals not fully allocated' : 'All withdrawals allocated'}
                </p>
              </>
            )}
          </Link>
        )}
      </div>

      {/* Continue work — text+button rows, not icon pastel grid */}
      <section aria-labelledby="continue-heading">
        <h2 id="continue-heading" className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Continue work
        </h2>
        <div className="bg-bg-surface border border-border rounded-xl divide-y divide-border">
          {CONTINUE_WORK.map((row) => (
            <Link
              key={row.to}
              to={row.to}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-bg-sunken/50 transition-colors group"
            >
              <row.icon className="w-4 h-4 text-text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">{row.label}</div>
                <div className="text-xs text-text-secondary truncate">{row.hint}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-disabled group-hover:text-accent shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      {/* Customizable financial widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {AVAILABLE_WIDGETS.filter(w => visibleWidgets.includes(w.key)).map(widget => {
          const Icon = widget.icon;
          return (
            <div
              key={widget.key}
              className="bg-bg-surface border border-border rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-text-secondary">
                <Icon className="w-4 h-4" />
                <h3 className="font-semibold text-[11px] tracking-wider uppercase">{widget.label}</h3>
              </div>
              <p className="text-xl font-mono font-semibold text-text-primary tracking-tight">{getWidgetValue(widget.key)}</p>
              {(() => {
                const trend = getWidgetTrend(widget.key);
                if (trend === null) return null;
                const isPositive = trend >= 0;
                return (
                  <div className={cn('flex items-center gap-1 text-xs font-semibold', isPositive ? 'text-success' : 'text-error')}>
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>{Math.abs(trend).toFixed(1)}%</span>
                    <span className="text-text-disabled font-normal ml-1">vs prior period</span>
                  </div>
                );
              })()}
            </div>
          );
        })}
        {visibleWidgets.length === 0 && (
          <div className="col-span-full bg-bg-surface border border-dashed border-border rounded-xl p-6 text-center text-text-secondary text-sm">
            No widgets selected. Click Customize to add metrics.
          </div>
        )}
      </div>

      {/* Tax liability link — quiet, not glow card */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
          <h2 className="text-base font-display font-semibold text-text-primary mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-text-secondary" /> Tax liability predictor
          </h2>
          <p className="text-sm text-text-secondary max-w-md">
            Upload GSTR-1 Excel to estimate cash liability against eligible ITC.
          </p>
        </div>
        <Link to="/app/tax-liability" className="btn-secondary !h-9 shrink-0">
          Open predictor
        </Link>
      </div>

      {analyticsData?.vendor_health && analyticsData.vendor_health.length > 0 && (
        <div className="bg-bg-surface border border-error/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-error" />
            <h2 className="text-base font-display font-semibold text-error">Vendor compliance alert</h2>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Vendors with Cancelled or Suspended GSTINs — ITC may be at risk.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-text-secondary border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Vendor</th>
                  <th className="pb-2 font-medium">GSTIN</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">ITC at risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analyticsData.vendor_health.map((v, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-text-primary">{v.vendor_name}</td>
                    <td className="py-2.5 font-mono text-text-secondary text-xs">{v.supplier_gstin}</td>
                    <td className="py-2.5">
                      <span className="badge bg-error-subtle text-error border border-error/20">{v.supplier_gstin_status}</span>
                    </td>
                    <td className="py-2.5 font-mono font-semibold text-error text-right">{formatCurrency(v.itc_at_risk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAnalyticsError ? (
        <ErrorState
          title="Analytics Failed to Load"
          message="Could not load advanced analytics data."
          onRetry={refetchAnalytics}
        />
      ) : isAnalyticsPending ? (
        <AnalyticsSkeleton />
      ) : (
        <AnalyticsCharts data={analyticsData ?? null} />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-text-primary">Recent invoices</h2>
          <Link to="/app/invoices" className="text-sm text-accent hover:text-accent-hover transition-colors font-medium">View all →</Link>
        </div>

        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="table-header">
                <tr>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="table-row">
                    <td className="p-3.5 font-medium text-text-primary">{inv.supplier_name || 'Unknown Vendor'}</td>
                    <td className="p-3.5 font-mono text-text-secondary text-xs">{inv.invoice_date || 'N/A'}</td>
                    <td className="p-3.5 font-mono font-medium text-text-primary text-right">{formatCurrency(inv.total_amount || 0)}</td>
                    <td className="p-3.5 text-center">
                      {(inv.confidence_score || 0) > 80 ? (
                        <span className="badge bg-success-subtle text-success border border-success/20">Processed</span>
                      ) : (
                        <span className="badge bg-warning-subtle text-warning border border-warning/20">Review</span>
                      )}
                    </td>
                  </tr>
                ))}

                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-text-secondary">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-7 h-7 opacity-40" />
                        <p className="text-sm">No invoices for this client yet.</p>
                        <Link to="/app/scan" className="btn-primary !h-9 mt-2">Scan first invoice</Link>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
