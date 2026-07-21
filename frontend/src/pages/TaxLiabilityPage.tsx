import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useClient } from '../lib/ClientContext';
import { getApiUrl } from '../lib/api';
import { formatCurrency } from '../utils/format';
import { UploadCloud, TrendingUp, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { motion } from 'framer-motion';

export default function TaxLiabilityPage() {
  const { activeClientId } = useClient();
  const [period, setPeriod] = useState('03-2024'); // Example default
  const [isUploading, setIsUploading] = useState(false);

  const { data: prediction, isLoading, isError, refetch } = useQuery({
    queryKey: ['tax_liability', activeClientId, period],
    queryFn: async () => {
      if (!activeClientId) return null;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Auth required");

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/sales/prediction?client_id=${activeClientId}&period=${period}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch liability prediction");
      const res = await response.json();
      return res.data;
    },
    enabled: !!activeClientId,
  });

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!activeClientId) {
      toast.error("Please select a client first.");
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', activeClientId);
    formData.append('period', period);

    setIsUploading(true);
    toast.loading("Parsing GSTR-1 Sales Data...", { id: 'sales_upload' });
    try {
      const apiUrl = getApiUrl();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      const response = await fetch(`${apiUrl}/api/sales/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload sales register");
      }
      
      const data = await response.json();
      toast.success(data.message, { id: 'sales_upload' });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Upload failed", { id: 'sales_upload' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, [activeClientId, period, refetch]);

  if (!activeClientId) {
    return (
      <div className="p-8 text-center text-text-secondary h-[40vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md border-border">
          <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">No Client Selected</h2>
          <p>Please select a client from the sidebar to view Cash Liability Predictions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-accent" /> Tax Liability Predictor
          </h1>
          <p className="text-text-secondary">Upload your GSTR-1 Sales Register to instantly calculate your cashflow requirements.</p>
        </div>
        
        <div className="flex items-center gap-4">
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
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              disabled={isUploading} 
            />
            <button className="btn-primary flex items-center gap-2" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Upload GSTR-1 Excel
            </button>
          </div>
        </div>
      </div>

      {isError ? (
        <ErrorState 
          title="Failed to load liability data"
          message="Ensure the database migrations have been executed."
          onRetry={refetch}
        />
      ) : isLoading ? (
        <div className="card p-8 space-y-4">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : prediction ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* LEDGER VIEW */}
          <div className="card p-8 bg-gradient-to-br from-bg-surface to-bg-sunken border-accent/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none"></div>
            <h2 className="text-xl font-bold text-text-primary mb-8">Cash Liability Ledger</h2>
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              
              <div className="flex-1 w-full text-center p-6 bg-bg-base/50 border border-border rounded-2xl">
                <p className="text-text-secondary text-sm font-medium mb-2 uppercase tracking-wider">Output Tax (Sales)</p>
                <p className="text-4xl font-mono text-text-primary font-bold">
                  {formatCurrency(prediction.current_sales_tax)}
                </p>
                <p className="text-xs text-text-secondary mt-2">From GSTR-1 B2B/B2C</p>
              </div>

              <div className="hidden md:flex text-text-disabled">
                <ArrowRight className="w-6 h-6" />
              </div>

              <div className="flex-1 w-full text-center p-6 bg-bg-base/50 border border-border rounded-2xl">
                <p className="text-text-secondary text-sm font-medium mb-2 uppercase tracking-wider">Eligible ITC</p>
                <p className="text-4xl font-mono text-success font-bold">
                  -{formatCurrency(prediction.current_eligible_itc)}
                </p>
                <p className="text-xs text-text-secondary mt-2">Strictly Matched Purchases</p>
              </div>

              <div className="hidden md:flex text-text-disabled">
                <ArrowRight className="w-6 h-6" />
              </div>

              <div className="flex-1 w-full text-center p-6 bg-bg-base/50 border border-border rounded-2xl">
                <p className="text-text-secondary text-sm font-medium mb-2 uppercase tracking-wider">Carry-Forward</p>
                <p className="text-4xl font-mono text-success font-bold">
                  -{formatCurrency(prediction.carry_forward_itc)}
                </p>
                <p className="text-xs text-text-secondary mt-2">Historical Excess ITC</p>
              </div>

            </div>

            <div className="mt-8 pt-8 border-t border-border flex flex-col items-center">
              <p className="text-text-secondary text-lg font-medium mb-2 uppercase tracking-widest">Final Cash Liability</p>
              <p className={`text-6xl font-mono font-black ${prediction.final_liability > 0 ? 'text-error' : 'text-success'}`}>
                {formatCurrency(prediction.final_liability)}
              </p>
              {prediction.final_liability === 0 && prediction.current_sales_tax > 0 && (
                <div className="mt-4 px-4 py-2 bg-success-subtle border border-success/20 rounded-full text-success text-sm font-medium">
                  Fully set-off by Input Tax Credit! No cash payment required.
                </div>
              )}
            </div>
          </div>
          
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-text-secondary">
            <span className="font-bold text-primary">Note:</span> The Eligible ITC is strictly calculated using scanned invoices that have successfully **Matched** with your GSTR-2B. Unreconciled or manually entered bills are conservatively excluded to prevent under-preparing cash reserves.
          </div>
        </motion.div>
      ) : (
        <div className="card p-12 text-center text-text-secondary">
          <TrendingUp className="w-12 h-12 text-border mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No Sales Data Found</h3>
          <p>Upload your GSTR-1 Excel for {period} to generate the Cash Liability Ledger.</p>
        </div>
      )}
    </div>
  );
}
