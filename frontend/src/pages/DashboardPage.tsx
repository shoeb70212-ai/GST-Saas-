import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, Settings, CheckCircle2, TrendingUp, Building2, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useClient } from '../lib/ClientContext';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '../components/ui/Skeleton';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
};

import * as XLSX from 'xlsx';

export const AVAILABLE_WIDGETS = [
  { key: 'total_taxable', label: 'Total Taxable Amount', icon: DollarSign },
  { key: 'total_cgst', label: 'Total CGST', icon: TrendingUp },
  { key: 'total_sgst', label: 'Total SGST', icon: TrendingUp },
  { key: 'total_igst', label: 'Total IGST', icon: TrendingUp },
  { key: 'total_outstanding', label: 'Total Outstanding', icon: DollarSign },
  { key: 'invoice_count', label: 'Total Invoices Scanned', icon: FileText },
];

const DEFAULT_WIDGETS = ['total_taxable', 'total_cgst', 'total_sgst', 'invoice_count'];

export default function DashboardPage() {
  const { activeClientId, clients } = useClient();
  const [showSettings, setShowSettings] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  
  const [salesTaxCollected, setSalesTaxCollected] = useState<number>(0);
  const [isSalesRegisterUploaded, setIsSalesRegisterUploaded] = useState(false);
  
  const { data: dashboardData, isLoading } = useQuery({
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
      
      let metrics = { totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalOutstanding: 0, invoiceCount: 0 };
      
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
      
      return { metrics, recentInvoices: recent || [] };
    },
    enabled: !!activeClientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const metrics = dashboardData?.metrics || { totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalOutstanding: 0, invoiceCount: 0 };
  const recentInvoices = dashboardData?.recentInvoices || [];

  useEffect(() => {
    const saved = localStorage.getItem('khatalens_widgets');
    if (saved) {
      try {
        setVisibleWidgets(JSON.parse(saved));
      } catch (e) {}
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

  const handleSalesRegisterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let totalSalesTax = 0;
        data.forEach((row: any) => {
          let rowTax = 0;
          const lowerKeys = Object.keys(row).map(k => k.toLowerCase());
          
          const hasSpecificTax = ['cgst', 'sgst', 'igst', 'utgst', 'cess'].some(t => lowerKeys.some(k => k.includes(t)));
          
          if (hasSpecificTax) {
            Object.keys(row).forEach(key => {
              const k = key.toLowerCase();
              if (['cgst', 'sgst', 'igst', 'utgst', 'cess'].some(t => k.includes(t))) {
                const val = parseFloat(row[key]);
                if (!isNaN(val)) rowTax += val;
              }
            });
          } else {
            const totalTaxKey = Object.keys(row).find(k => {
              const lower = k.toLowerCase();
              return lower.includes('total tax') || lower.includes('tax amount') || lower.includes('gst amount') || lower === 'tax';
            });
            if (totalTaxKey) {
              const val = parseFloat(row[totalTaxKey]);
              if (!isNaN(val)) rowTax += val;
            }
          }
          totalSalesTax += rowTax;
        });
        
        setSalesTaxCollected(totalSalesTax);
        setIsSalesRegisterUploaded(true);
      } catch (err) {
        console.error("Failed to parse Sales Register", err);
      }
    };
    reader.readAsBinaryString(file);
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
          <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
             <button 
               onClick={async () => {
                 try {
                   toast.loading("Setting up your workspace...", { id: "setup" });
                   const { data: { user } } = await supabase.auth.getUser();
                   if (!user) throw new Error("Not authenticated");
                   const { error } = await supabase.from('clients').insert({
                     user_id: user.id,
                     client_name: 'My Business',
                     gstin: 'PENDING'
                   });
                   if (error) throw error;
                   localStorage.setItem('accountType', 'business');
                   toast.success("Workspace ready!", { id: "setup" });
                   window.location.reload(); 
                 } catch (err: any) {
                   toast.error(err.message || "Failed to setup workspace", { id: "setup" });
                 }
               }}
               className="btn-primary flex items-center justify-center gap-3 py-3 w-full"
             >
               <Briefcase className="w-5 h-5" /> I'm a Single Business
             </button>
             <button 
               onClick={() => {
                 localStorage.setItem('accountType', 'firm');
                 window.location.href = '/clients';
               }} 
               className="btn-secondary flex items-center justify-center gap-3 py-3 w-full"
             >
               <Building2 className="w-5 h-5" /> I'm an Accounting Firm
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
            <div key={widget.key} className="card space-y-2 p-5 hover:border-border transition-colors">
              <div className="flex items-center gap-2 text-text-secondary">
                <Icon className="w-4 h-4" />
                <h3 className="font-medium text-sm">{widget.label}</h3>
              </div>
              <p className="text-2xl font-bold text-text-primary font-mono">{getWidgetValue(widget.key)}</p>
            </div>
          );
        })}
        {visibleWidgets.length === 0 && (
          <div className="col-span-full card p-8 text-center text-text-secondary border-dashed border-2">
            No widgets selected. Click Customize to add widgets to your dashboard.
          </div>
        )}
      </div>

      {/* Tax Liability Predictor Widget */}
      <div className="card bg-gradient-to-br from-bg-surface to-bg-sunken border-accent/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex flex-col md:flex-row gap-8 justify-between items-start md:items-center relative z-10">
          <div>
            <h2 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" /> Tax Liability Predictor
            </h2>
            <p className="text-sm text-text-secondary max-w-md">
              Import your Sales Register (Excel) to instantly calculate your estimated GST cash liability for this period.
            </p>
            
            <div className="mt-4 flex items-center gap-4">
              <div className="relative">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSalesRegisterUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <button className="btn-secondary text-sm">Upload Sales Register</button>
              </div>
              {isSalesRegisterUploaded && (
                <span className="text-success text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Loaded</span>
              )}
            </div>
          </div>
          
          <div className="flex-1 w-full md:w-auto md:max-w-xs card bg-bg-base/50 border border-white/5 backdrop-blur-sm">
            <div className="space-y-2 mb-4 pb-4 border-b border-white/5">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Sales Tax Collected:</span>
                <span className="font-mono text-text-primary">{formatCurrency(salesTaxCollected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Purchase ITC (from DB):</span>
                <span className="font-mono text-success">-{formatCurrency(metrics.totalCgst + metrics.totalSgst + metrics.totalIgst)}</span>
              </div>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-text-primary">Est. Cash Liability:</span>
              <span className={`font-mono ${salesTaxCollected - (metrics.totalCgst + metrics.totalSgst + metrics.totalIgst) > 0 ? 'text-error' : 'text-success'}`}>
                {formatCurrency(Math.max(0, salesTaxCollected - (metrics.totalCgst + metrics.totalSgst + metrics.totalIgst)))}
              </span>
            </div>
          </div>
        </div>
      </div>

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
