import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useClient } from '../lib/ClientContext';
import { UploadCloud, CheckCircle2, AlertTriangle, AlertCircle, Loader2, FileSearch } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReconciliationPage() {
  const { activeClientId } = useClient();
  const [period, setPeriod] = useState('03-2024'); // Example default
  const [isUploading, setIsUploading] = useState(false);

  const { data: invoices, refetch } = useQuery({
    queryKey: ['reconciliation', activeClientId, period],
    queryFn: async () => {
      if (!activeClientId) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', activeClientId)
        .eq('recon_period', period);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId,
  });

  const { data: gstr2bRecords } = useQuery({
    queryKey: ['gstr2b', activeClientId, period],
    queryFn: async () => {
      if (!activeClientId) return [];
      const { data, error } = await supabase
        .from('gstr2b_records')
        .select('*')
        .eq('client_id', activeClientId)
        .eq('period', period);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeClientId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', activeClientId);
    formData.append('period', period);

    setIsUploading(true);
    toast.loading("Reconciling with GSTR-2B...", { id: 'recon' });
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      const response = await fetch(`${apiUrl}/api/reconcile`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to reconcile");
      const data = await response.json();
      toast.success(data.message, { id: 'recon' });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Reconciliation failed", { id: 'recon' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  if (!activeClientId) {
    return <div className="p-8 text-center text-text-secondary h-[80vh] flex items-center justify-center">
      <div className="card p-8 text-center max-w-md">
        <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
        <h2 className="text-xl font-bold text-text-primary mb-2">No Client Selected</h2>
        <p>Please select a client from the sidebar to view GSTR-2B reconciliation.</p>
      </div>
    </div>;
  }

  const matched = invoices?.filter(i => i.recon_status === 'matched') || [];
  const mismatched = invoices?.filter(i => i.recon_status === 'mismatch') || [];
  const missingIn2B = invoices?.filter(i => i.recon_status === 'missing_in_2b') || [];

  const cleanStr = (s: string) => (s || '').toString().trim().toUpperCase().replace(/[-/\s]/g, '').replace(/(\D)0+(\d)/g, '$1$2');

  const invoiceKeys = new Set(
    (invoices || []).map(inv => `${cleanStr(inv.supplier_gstin)}_${cleanStr(inv.invoice_number)}`)
  );

  const missingInPR = gstr2bRecords?.filter(g2b => {
    const g2bKey = `${cleanStr(g2b.supplier_gstin)}_${cleanStr(g2b.invoice_number)}`;
    return !invoiceKeys.has(g2bKey);
  }) || [];

  const tableData = [
    ...(invoices || []).map(inv => ({
      id: inv.id,
      supplier_gstin: inv.supplier_gstin,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      taxable_amount: inv.taxable_amount,
      status: inv.recon_status
    })),
    ...missingInPR.map(g2b => ({
      id: g2b.id,
      supplier_gstin: g2b.supplier_gstin,
      invoice_number: g2b.invoice_number,
      invoice_date: g2b.invoice_date,
      taxable_amount: g2b.taxable_value,
      status: 'missing_in_pr'
    }))
  ];

  const [isDeepMatching, setIsDeepMatching] = useState(false);

  const handleDeepMatch = async () => {
    if (!activeClientId) return;
    setIsDeepMatching(true);
    toast.loading("Running AI Deep Match...", { id: 'deep-match' });
    try {
      const formData = new FormData();
      formData.append('client_id', activeClientId);
      formData.append('period', period);
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      const response = await fetch(`${apiUrl}/api/reconcile/deep-match`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error("Insufficient credits for AI Deep Match. Please recharge.");
        }
        throw new Error("Deep match failed");
      }
      
      const data = await response.json();
      toast.success(data.message, { id: 'deep-match' });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "AI Deep Match failed", { id: 'deep-match' });
    } finally {
      setIsDeepMatching(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">GSTR-2B Reconciliation</h1>
          <p className="text-text-secondary">Upload government GSTR-2B Excel to instantly match Purchase ITC.</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <input 
            type="month" 
            value={period.split('-').reverse().join('-')} 
            onChange={(e) => {
               const [y, m] = e.target.value.split('-');
               if(y && m) setPeriod(`${m}-${y}`);
            }}
            className="px-4 py-2 bg-bg-surface border border-border rounded-lg text-sm text-text-primary focus:border-accent outline-none" 
          />
          <div className="relative">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isUploading || isDeepMatching} />
            <button className="btn-primary flex items-center gap-2" disabled={isUploading || isDeepMatching}>
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Upload GSTR-2B
            </button>
          </div>
          <button 
            onClick={handleDeepMatch} 
            disabled={isDeepMatching || isUploading || (missingIn2B.length === 0 || missingInPR.length === 0)}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-md shadow-purple-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeepMatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-base leading-none">✨</span>}
            AI Deep Match (1 Credit)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card border-t-4 border-t-success hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-success flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> Matched</h3>
            <span className="text-3xl font-bold text-text-primary">{matched.length}</span>
          </div>
          <p className="text-sm text-text-secondary">Perfect match (±₹1 tolerance)</p>
        </div>
        <div className="card border-t-4 border-t-warning hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-warning flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Value Mismatch</h3>
            <span className="text-3xl font-bold text-text-primary">{mismatched.length}</span>
          </div>
          <p className="text-sm text-text-secondary">Invoice exists but amounts differ</p>
        </div>
        <div className="card border-t-4 border-t-error hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-error flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Missing in 2B</h3>
            <span className="text-3xl font-bold text-text-primary">{missingIn2B.length}</span>
          </div>
          <p className="text-sm text-text-secondary">ITC at risk! Vendor didn't file.</p>
        </div>
        <div className="card border-t-4 border-t-accent hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-accent flex items-center gap-2"><FileSearch className="w-5 h-5"/> Missing in PR</h3>
            <span className="text-3xl font-bold text-text-primary">{missingInPR.length}</span>
          </div>
          <p className="text-sm text-text-secondary">Vendor filed, but no scan</p>
        </div>
      </div>

      {tableData.length > 0 && (
        <div className="card p-0 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="table-header">
                <tr>
                  <th className="p-4">Vendor GSTIN</th>
                  <th className="p-4">Invoice #</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Taxable Amount</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tableData.map((row) => (
                  <tr key={row.id} className="hover:bg-bg-subtle transition-colors group">
                    <td className="p-4 font-medium text-text-primary">{row.supplier_gstin || 'N/A'}</td>
                    <td className="p-4 font-mono text-text-secondary">{row.invoice_number || 'N/A'}</td>
                    <td className="p-4 font-mono text-text-secondary">{row.invoice_date || 'N/A'}</td>
                    <td className="p-4 font-mono text-right font-medium">₹{row.taxable_amount?.toFixed(2) || '0.00'}</td>
                    <td className="p-4 text-center">
                      {row.status === 'matched' ? (
                        <span className="badge bg-success-subtle text-success border border-success/20">Matched</span>
                      ) : row.status === 'mismatch' ? (
                        <span className="badge bg-warning-subtle text-warning border border-warning/20">Mismatch</span>
                      ) : row.status === 'missing_in_pr' ? (
                        <span className="badge bg-accent/10 text-accent border border-accent/20">Missing in PR</span>
                      ) : (
                        <span className="badge bg-error-subtle text-error border border-error/20">Missing in 2B</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
