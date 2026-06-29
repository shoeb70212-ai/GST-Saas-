import { useEffect, useState } from 'react';
import { DollarSign, AlertTriangle, Scale, Clock, Loader2, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateSunkGST, calculateMsmedInterest, calculateRule37ItcAtRisk } from '../lib/calculations';
import { Link } from 'react-router-dom';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    sunkGst: 0,
    totalOutstanding: 0,
    msmedInterest: 0,
    rule37Risk: 0,
    unpaidCount: 0
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!invoices) return;

      let sunkGst = 0;
      let totalOutstanding = 0;
      let msmedInterest = 0;
      let rule37Risk = 0;
      let unpaidCount = 0;

      const rbiBankRate = 6.5; // Default hardcoded for Phase 1
      const today = new Date();

      invoices.forEach(inv => {
        // Assume amount_paid is 0 if null
        const amountPaid = inv.amount_paid || 0;
        const totalAmount = inv.total_amount || 0;
        const taxableAmount = inv.taxable_amount || 0;
        const gstAmount = inv.gst_amount || 0;
        
        // Use 18% as a fallback if gst_rate is not directly saved, though we have gst_amount
        const gstRate = taxableAmount > 0 ? (gstAmount / taxableAmount) * 100 : 18;

        if (totalAmount > amountPaid) {
          unpaidCount++;
          totalOutstanding += (totalAmount - amountPaid);
          
          // Sunk GST
          sunkGst += calculateSunkGST(taxableAmount, gstRate, amountPaid, totalAmount);
          
          // MSMED Interest (Days overdue from 45 days after invoice date)
          if (inv.invoice_date) {
            const invDate = new Date(inv.invoice_date);
            const msmedDueDate = new Date(invDate);
            msmedDueDate.setDate(msmedDueDate.getDate() + 45);
            
            const daysOverdueMsmed = Math.floor((today.getTime() - msmedDueDate.getTime()) / (1000 * 3600 * 24));
            if (daysOverdueMsmed > 0) {
              const outstandingPrincipal = taxableAmount - (amountPaid > gstAmount ? amountPaid - gstAmount : 0);
              msmedInterest += calculateMsmedInterest(outstandingPrincipal > 0 ? outstandingPrincipal : 0, rbiBankRate, daysOverdueMsmed);
            }

            // Rule 37 Risk (135 - 180 days from invoice date)
            const daysFromInvoice = Math.floor((today.getTime() - invDate.getTime()) / (1000 * 3600 * 24));
            if (daysFromInvoice >= 135) {
              rule37Risk += calculateRule37ItcAtRisk(gstAmount, amountPaid, totalAmount);
            }
          }
        }
      });

      setMetrics({
        sunkGst,
        totalOutstanding,
        msmedInterest,
        rule37Risk,
        unpaidCount
      });

      setRecentInvoices(invoices.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-textMuted">Overview of your MSME collections and GST exposure.</p>
      </div>

      {/* Sunk GST Hero Widget */}
      <div className="bg-gradient-to-br from-surface to-surface/50 border border-red-500/20 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-red-400 mb-4">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-semibold uppercase tracking-wider text-sm">Sunk GST Exposure</h2>
          </div>
          <div className="text-5xl font-mono font-bold text-white mb-2">
            {formatCurrency(metrics.sunkGst)}
          </div>
          <p className="text-textMuted max-w-md">
            This is GST you have already paid to the government on unpaid invoices. 
            It is a permanent cash loss until your buyers pay you.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 text-textMuted mb-3">
            <DollarSign className="w-4 h-4" />
            <h3 className="font-medium">Total Outstanding</h3>
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {formatCurrency(metrics.totalOutstanding)}
          </div>
          <p className="text-xs text-textMuted">Across {metrics.unpaidCount} unpaid invoices</p>
        </div>

        <div className="glass-card p-6 border-amber-500/20">
          <div className="flex items-center gap-3 text-amber-400 mb-3">
            <Scale className="w-4 h-4" />
            <h3 className="font-medium">MSMED Interest Accrued</h3>
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {formatCurrency(metrics.msmedInterest)}
          </div>
          <p className="text-xs text-textMuted">Legally owed to you beyond principal</p>
        </div>

        <div className="glass-card p-6 border-red-500/20">
          <div className="flex items-center gap-3 text-red-400 mb-3">
            <Clock className="w-4 h-4" />
            <h3 className="font-medium">Rule 37 Zone (ITC Risk)</h3>
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {formatCurrency(metrics.rule37Risk)}
          </div>
          <p className="text-xs text-textMuted">Buyer ITC at risk (135+ days)</p>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="glass-card p-0 overflow-hidden border-white/5">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-semibold text-white">Recently Saved Invoices</h3>
          <Link to="/invoices" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        {recentInvoices.length === 0 ? (
          <div className="p-8 text-center text-textMuted flex flex-col items-center">
            <FileText className="w-8 h-8 mb-3 opacity-20" />
            <p>No invoices saved yet.</p>
            <Link to="/scan" className="text-primary mt-2 hover:underline">Scan an invoice to get started</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-textMuted border-b border-white/5 bg-white/5">
                  <th className="px-6 py-3 font-medium">Invoice Date</th>
                  <th className="px-6 py-3 font-medium">Buyer / Supplier</th>
                  <th className="px-6 py-3 font-medium">Invoice No.</th>
                  <th className="px-6 py-3 font-medium text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">{inv.invoice_date || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{inv.buyer_name || 'Unknown Buyer'}</div>
                      <div className="text-xs text-textMuted">{inv.supplier_name}</div>
                    </td>
                    <td className="px-6 py-4 text-textMuted">{inv.invoice_number || '-'}</td>
                    <td className="px-6 py-4 text-right font-mono text-white">
                      {formatCurrency(inv.total_amount || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
