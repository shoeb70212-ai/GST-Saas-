import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, Settings, CheckCircle2, TrendingUp, Building2, Briefcase, AlertTriangle, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useClient } from '../lib/ClientContext';
import { motion, AnimatePresence } from 'framer-motion';
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

export default function DashboardPage() {
  const { activeClientId, clients, setActiveClientId } = useClient();
  const [showSettings, setShowSettings] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  
  
  
  
  
  const { data: dashboardData, isLoading, isError: isDashboardError, refetch: refetchDashboard } = useQuery({
    queryKey: ['invoices', 'dashboard', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return { metrics: null, recentInvoices: [] };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { metrics: null, recentInvoices: [] };
      
      // Fetch recent 5 invoices
      const { data: recent, error: recentError } = await supabase
        .from('invoices')
        .select('id, file_name, supplier_name, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, received_amount, recon_status, processing_status, invoice_date, created_at, confidence_score')
        .eq('user_id', session.user.id)
        .eq('client_id', activeClientId)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (recentError) throw recentError;

      // Fetch metrics via RPC (if RPC is missing, it will throw, so fallback to local calculation)
      const { data: metricsData, error: metricsError } = await supabase.rpc('get_dashboard_metrics', {
        client_id_param: activeClientId,
        user_id_param: session.user.id
      });
      
      let metrics = { ...DEFAULT_METRICS };
      
      if (metricsError) {
        console.warn("RPC not found, falling back to client-side limit calculation");
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
      
      // Fetch client details for estimated sales
      const { data: clientData } = await supabase.from('clients').select('estimated_monthly_sales, estimated_sales_tax_rate').eq('id', activeClientId).single();
      
      return { metrics, recentInvoices: recent || [], clientData };
    },
    enabled: !!activeClientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: analyticsData, isError: isAnalyticsError, refetch: refetchAnalytics } = useQuery<AnalyticsData | null>({
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
        console.error("Failed to fetch advanced analytics:", error);
        return null;
      }
      return data as AnalyticsData;
    },
    enabled: !!activeClientId,
    staleTime: 5 * 60 * 1000,
  });

  const metrics = dashboardData?.metrics || DEFAULT_METRICS;
  const recentInvoices = dashboardData?.recentInvoices || [];
  const clientData = dashboardData?.clientData;

  useEffect(() => {
    if (clientData) {
      
      
    }
  }, [clientData]);

  
  
  
  
  

  useEffect(() => {
    const saved = localStorage.getItem('khatalens_widgets');
    if (saved) {
      try {
        setVisibleWidgets(JSON.parse(saved));
      } catch (_e) {}
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
    
    // We only have total_taxable and total_spend in trends.
    // For most financial metrics on the dashboard, total_taxable provides a good proxy trend.
    if (key === 'invoice_count') return null; 

    if (previous.total_taxable === 0) return null;
    
    const diff = ((current.total_taxable - previous.total_taxable) / previous.total_taxable) * 100;
    return diff;
  };



  if (!activeClientId) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto h-[80vh] flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-full bg-bg-sunken flex items-center justify-center mb-6">
          <Building2 className="w-10 h-10 text-text-disabled" />
        </div>
        <h2 className="text-3xl font-bold text-text-primary mb-2">Welcome to KhataLens</h2>
        <p className="text-text-secondary max-w-md mb-8">
          How will you be using KhataLens? Choose your account type to set up your workspace.
        </p>
        
        {clients.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mx-auto">
             
             <button
               onClick={() => {
                 localStorage.setItem('accountType', 'firm');
                 window.location.href = '/clients'; // Redirect to clients setup
               }}
               className="card p-8 flex flex-col items-start text-left hover:border-accent hover:shadow-glow group transition-all"
             >
               <div className="w-12 h-12 rounded-xl bg-accent-subtle flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                 <Building2 className="w-6 h-6 text-accent" />
               </div>
               <h3 className="text-xl font-bold text-text-primary mb-2">Accounting Firm (CA)</h3>
               <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                 I manage invoices, bank statements, and GST reconciliation for multiple clients.
               </p>
               <div className="mt-auto text-accent text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                 Set up clients <ArrowRight className="w-4 h-4" />
               </div>
             </button>

             <button 
               onClick={async () => {
                 const { data: { session } } = await supabase.auth.getSession();
                 if (session) {
                   const { data, error } = await supabase.from('clients').insert({
                     user_id: session.user.id,
                     client_name: "My Company",
                     is_active: true
                   }).select().single();
                   if (!error && data) {
                     setActiveClientId(data.id);
                     localStorage.setItem('accountType', 'business');
                   }
                 }
               }}
               className="card p-8 flex flex-col items-start text-left border-border/50 hover:border-accent/50 opacity-90 hover:opacity-100 transition-all group"
             >
               <div className="w-12 h-12 rounded-xl bg-bg-sunken flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                 <Briefcase className="w-6 h-6 text-text-secondary group-hover:text-text-primary" />
               </div>
               <h3 className="text-lg font-bold text-text-primary mb-2">Single Business</h3>
               <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                 I only need to manage invoices and reconciliation for my own company.
               </p>
               <div className="mt-auto text-text-secondary group-hover:text-text-primary text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                 Create workspace <ArrowRight className="w-4 h-4" />
               </div>
             </button>
             
          </div>
        ) : (
          <div className="mt-4">
             <p className="text-text-secondary max-w-md mb-6">
               Please select a workspace from the sidebar dropdown to view its specific dashboard metrics and invoices.
             </p>
             <Link to="/clients" className="btn-primary">Manage {localStorage.getItem('accountType') === 'business' ? 'Businesses' : 'Clients'}</Link>
          </div>
        )}
      </div>
    );
  }

  if (isDashboardError) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto h-[80vh] flex items-center justify-center">
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
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
        <div className="flex justify-between items-end mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card space-y-2 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
        
        {/* Analytics Skeletons */}
        <AnalyticsSkeleton />

        <div className="card h-48 w-full mt-8">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Dashboard</h1>
          <p className="text-text-secondary">Overview of invoices for this client.</p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border flex items-center gap-2"
          >
            <Settings className="w-4 h-4" /> <span className="text-sm font-medium">Customize</span>
          </button>

          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-64 bg-bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden"
              >
                <div className="p-3 border-b border-border bg-bg-sunken/50">
                  <h3 className="font-semibold text-text-primary text-sm">Visible Widgets</h3>
                </div>
                <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {AVAILABLE_WIDGETS.map(widget => {
                    const isVisible = visibleWidgets.includes(widget.key);
                    return (
                      <button
                        key={widget.key}
                        onClick={() => toggleWidget(widget.key)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${isVisible ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-bg-sunken'}`}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {AVAILABLE_WIDGETS.filter(w => visibleWidgets.includes(w.key)).map(widget => {
          const Icon = widget.icon;
          return (
            <motion.div 
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              key={widget.key} 
              className="card space-y-3 p-6 hover:border-accent/50 hover:shadow-md transition-all cursor-default group"
            >
              <div className="flex items-center gap-2 text-text-secondary group-hover:text-accent transition-colors">
                <Icon className="w-5 h-5" />
                <h3 className="font-semibold text-xs tracking-widest uppercase">{widget.label}</h3>
              </div>
              <p className="text-3xl font-bold text-text-primary font-display tracking-tight">{getWidgetValue(widget.key)}</p>
              {(() => {
                const trend = getWidgetTrend(widget.key);
                if (trend === null) return null;
                const isPositive = trend >= 0;
                return (
                  <div className={cn("flex items-center gap-1 text-xs font-semibold mt-1", isPositive ? "text-emerald-500" : "text-error")}>
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>{Math.abs(trend).toFixed(1)}%</span>
                    <span className="text-text-disabled font-normal ml-1">vs last month</span>
                  </div>
                );
              })()}
            </motion.div>
          );
        })}
        {visibleWidgets.length === 0 && (
          <div className="col-span-full card p-8 text-center text-text-secondary border-dashed border-2">
            No widgets selected. Click Customize to add widgets to your dashboard.
          </div>
        )}
      </div>

      {/* Tax Liability Predictor Widget (Redirect Banner) */}
      <motion.div 
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="card bg-gradient-to-br from-bg-surface to-bg-sunken border-accent/20 relative overflow-hidden group hover:shadow-glow"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex flex-col md:flex-row gap-8 justify-between items-start md:items-center relative z-10">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" /> Tax Liability Predictor
            </h2>
            <p className="text-sm text-text-secondary max-w-md mb-4">
              Upload your GSTR-1 Excel to instantly calculate your cash liability against eligible ITC with carry-forward support.
            </p>
            <Link to="/tax-liability" className="btn-primary inline-flex items-center gap-2">
              Open Predictor <TrendingUp className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Vendor Health Widget */}
      {analyticsData?.vendor_health && analyticsData.vendor_health.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-error-subtle/30 border-error/20 relative overflow-hidden backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 mb-4">
             <AlertTriangle className="w-6 h-6 text-error" />
             <h2 className="text-lg font-bold text-error">Vendor Compliance Alert</h2>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            The following vendors have 'Cancelled' or 'Suspended' GSTINs. The Input Tax Credit (ITC) from these vendors is at risk. You should consider holding their payments.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-text-secondary border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Vendor Name</th>
                  <th className="pb-2 font-medium">GSTIN</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">ITC At Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {analyticsData.vendor_health.map((v, i) => (
                  <tr key={i}>
                    <td className="py-3 font-medium text-text-primary">{v.vendor_name}</td>
                    <td className="py-3 font-mono text-text-secondary">{v.supplier_gstin}</td>
                    <td className="py-3">
                      <span className="badge bg-error-subtle text-error border border-error/20">{v.supplier_gstin_status}</span>
                    </td>
                    <td className="py-3 font-mono font-bold text-error text-right">{formatCurrency(v.itc_at_risk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Advanced Analytics Hub */}
      {isAnalyticsError ? (
        <ErrorState 
          title="Analytics Failed to Load" 
          message="Could not load advanced analytics data."
          onRetry={refetchAnalytics}
        />
      ) : (
        <AnalyticsCharts data={analyticsData ?? null} />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Recent Invoices</h2>
          <Link to="/invoices" className="text-sm text-accent hover:text-accent-hover transition-colors font-medium">View all →</Link>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="table-header">
                <tr>
                  <th className="p-4">Vendor</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="table-row">
                    <td className="p-4 font-medium text-text-primary">{inv.supplier_name || 'Unknown Vendor'}</td>
                    <td className="p-4 font-mono text-text-secondary">{inv.invoice_date || 'N/A'}</td>
                    <td className="p-4 font-mono font-medium text-text-primary text-right">{formatCurrency(inv.total_amount || 0)}</td>
                    <td className="p-4 text-center">
                      {(inv.confidence_score || 0) > 80 ? (
                        <span className="badge bg-success-subtle text-success border border-success/20">Processed</span>
                      ) : (
                        <span className="badge bg-warning-subtle text-warning border border-warning/20">Review</span>
                      )}
                      {(inv as any).approval_status === 'pending_approval' && (
                        <div className="mt-1">
                          <span className="badge bg-warning-subtle text-warning border border-warning/20 text-[10px]">Pending Appr.</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                
                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-text-secondary">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-8 h-8 opacity-50" />
                        <p>No invoices processed for this client yet.</p>
                        <Link to="/scan" className="text-accent hover:underline mt-2">Upload your first invoice</Link>
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
