import { useEffect, useState } from 'react';
import { DollarSign, FileText, Settings, Loader2, CheckCircle2, TrendingUp, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useClient } from '../lib/ClientContext';
import { motion, AnimatePresence } from 'framer-motion';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
};

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
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  
  const [metrics, setMetrics] = useState({
    totalTaxable: 0,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalOutstanding: 0,
    invoiceCount: 0,
  });
  
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('payforce_widgets');
    if (saved) {
      try {
        setVisibleWidgets(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const toggleWidget = (key: string) => {
    setVisibleWidgets(prev => {
      const next = prev.includes(key) ? prev.filter(w => w !== key) : [...prev, key];
      localStorage.setItem('payforce_widgets', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeClientId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let query = supabase
        .from('invoices')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (activeClientId) {
        query = query.eq('client_id', activeClientId);
      } else {
        // If no active client, don't show any data to prevent mixing
        setMetrics({ totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalOutstanding: 0, invoiceCount: 0 });
        setRecentInvoices([]);
        setLoading(false);
        return;
      }

      const { data: invoices, error } = await query;

      if (error) throw error;
      if (!invoices) return;

      let totalTaxable = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      let totalOutstanding = 0;

      invoices.forEach(inv => {
        const amountPaid = inv.received_amount || 0;
        const totalAmount = inv.total_amount || 0;
        
        totalTaxable += inv.taxable_amount || 0;
        totalCgst += inv.cgst_amount || 0;
        totalSgst += inv.sgst_amount || 0;
        totalIgst += inv.igst_amount || 0;
        
        if (totalAmount > amountPaid) {
          totalOutstanding += (totalAmount - amountPaid);
        }
      });

      setMetrics({
        totalTaxable,
        totalCgst,
        totalSgst,
        totalIgst,
        totalOutstanding,
        invoiceCount: invoices.length,
      });

      setRecentInvoices(invoices.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

  if (!activeClientId) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto h-[80vh] flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-full bg-bg-sunken flex items-center justify-center mb-6">
          <Building2 className="w-10 h-10 text-text-disabled" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">No Active Client Selected</h2>
        <p className="text-text-secondary max-w-md mb-6">
          Please select a client from the sidebar dropdown to view their specific dashboard metrics and invoices.
        </p>
        {clients.length === 0 && (
          <Link to="/clients" className="btn-primary">Manage Clients</Link>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
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
