import { useState, useEffect, useCallback  } from "react";
import { useDropzone } from 'react-dropzone';
import { useClient } from '../lib/ClientContext';
import { supabase } from '../lib/supabase';
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle, Eye, RefreshCw, AlertCircle, Building2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

import { getApiUrl } from '../lib/api';

export default function BankStatementsPage() {
  const { activeClientId } = useClient();
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const fetchStatements = useCallback(async () => {
    if (!activeClientId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/bank-statements/list/${activeClientId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.status === 'success') {
        setStatements(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [activeClientId]);

  useEffect(() => {
    setLoading(true);
    fetchStatements().finally(() => setLoading(false));
  }, [fetchStatements]);

  // Polling for processing statements
  useEffect(() => {
    const hasProcessing = statements.some(s => s.status.startsWith('processing'));
    if (hasProcessing) {
      const timer = setInterval(() => {
        fetchStatements();
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [statements, fetchStatements]);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      toast.error('Invalid file type. Only PDF, Excel, and CSV statements are supported.');
      return;
    }

    if (!activeClientId) {
      toast.error("Please select a client first.");
      return;
    }
    const file = acceptedFiles[0];
    if (!file) return;

    const validTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'application/vnd.ms-excel', 
      'text/csv'
    ];
    if (!validTypes.includes(file.type)) {
      toast.error('Only PDF, Excel, and CSV statements are supported.');
      return;
    }

    try {
      setUploading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('client_id', activeClientId);
      if (pdfPassword) {
        formData.append('pdf_password', pdfPassword);
      }

      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/bank-statements/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Upload failed');
      
      toast.success(json.message || 'Statement uploaded successfully');
      fetchStatements();
    } catch (e: any) {
      toast.error(e.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  }, [activeClientId, fetchStatements, pdfPassword]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1,
    disabled: uploading || !activeClientId
  });

  const viewTransactions = async (stmtId: string) => {
    if (selectedStatementId === stmtId) {
      setSelectedStatementId(null);
      return;
    }
    setSelectedStatementId(stmtId);
    setTxnsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/bank-statements/${stmtId}/transactions`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.status === 'success') {
        setTransactions(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTxnsLoading(false);
    }
  };

  const cancelStatement = async (stmtId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/bank-statements/${stmtId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (!res.ok) throw new Error('Failed to cancel');
      toast.success('Processing cancelled');
      fetchStatements();
    } catch (e) {
      toast.error('Could not cancel processing');
    }
  };

  if (!activeClientId) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center h-full">
        <div className="text-center p-8 bg-bg-surface border border-border rounded-2xl max-w-md">
          <Building2 className="w-12 h-12 text-text-disabled mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold text-text-primary mb-2">No Client Selected</h2>
          <p className="text-text-secondary text-sm">Please select a client from the top navigation menu to manage their bank statements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary mb-1">Bank Statements</h1>
          <p className="text-sm text-text-secondary">Upload bank statements for AI extraction and reconciliation.</p>
        </div>
        <button onClick={fetchStatements} className="btn-ghost shrink-0">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Upload Zone */}
      <div className="mb-6 max-w-sm mx-auto">
        <label className="block text-sm font-medium text-text-secondary mb-1">PDF Password (Optional)</label>
        <input 
          type="password"
          placeholder="If statement is encrypted..."
          value={pdfPassword}
          onChange={e => setPdfPassword(e.target.value)}
          className="w-full bg-bg-surface border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-accent"
          disabled={uploading}
        />
        <p className="text-xs text-text-disabled mt-1 text-center">We automatically remove the password for future viewing.</p>
      </div>

      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all duration-300 ${
          isDragActive ? 'border-accent bg-accent-subtle shadow-md' : 'border-border bg-bg-surface hover:border-accent/50 hover:bg-bg-sunken'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="w-16 h-16 mx-auto bg-bg-base border border-border rounded-full flex items-center justify-center mb-4 shadow-sm">
          {uploading ? (
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          ) : (
            <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-accent' : 'text-text-secondary'}`} />
          )}
        </div>
        <h3 className="text-lg font-display font-bold text-text-primary mb-2">
          {isDragActive ? 'Drop statement here' : 'Upload Bank Statement'}
        </h3>
        <p className="text-sm text-text-secondary font-light max-w-md mx-auto">
          Drag and drop a PDF, Excel, or CSV statement here, or click to browse. Max 25MB. The AI will extract all transactions automatically.
        </p>
      </div>

      {/* Statements List */}
      <div className="card p-0 overflow-hidden">
        <div className="p-5 border-b border-border bg-bg-surface flex items-center justify-between">
          <h2 className="font-display font-semibold text-text-primary">Uploaded Statements</h2>
          <span className="badge bg-bg-sunken text-text-secondary border border-border">{statements.length} items</span>
        </div>
        
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-text-disabled" /></div>
        ) : statements.length === 0 ? (
          <div className="p-10 text-center text-text-secondary text-sm">No statements uploaded yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {statements.map(stmt => (
              <div key={stmt.id} className="bg-bg-surface hover:bg-bg-sunken transition-colors">
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-bg-base border border-border flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-text-secondary" />
                    </div>
                    <div>
                      <div className="font-medium text-text-primary text-sm flex items-center gap-2">
                        {stmt.bank_name || 'Processing Bank Name...'}
                        {stmt.account_number && <span className="text-xs font-mono text-text-secondary bg-bg-base px-2 py-0.5 rounded border border-border">*{stmt.account_number.slice(-4)}</span>}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        Uploaded: {new Date(stmt.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    {stmt.status.startsWith('processing') && (
                      <div className="flex items-center gap-2 text-warning text-sm font-medium bg-warning-subtle px-3 py-1.5 rounded-full border border-warning/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 
                        {stmt.status === 'processing' ? 'Processing...' : stmt.status.replace('processing:', '').trim()}
                        <button onClick={() => cancelStatement(stmt.id)} className="ml-2 hover:text-red-500 transition-colors" title="Cancel Processing">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {stmt.status === 'cancelled' && (
                      <div className="flex items-center gap-2 text-text-secondary text-sm font-medium bg-bg-sunken px-3 py-1.5 rounded-full border border-border">
                        <XCircle className="w-3.5 h-3.5" /> Cancelled
                      </div>
                    )}
                    {stmt.status === 'completed' && (
                      <div className="flex items-center gap-2 text-success text-sm font-medium bg-success-subtle px-3 py-1.5 rounded-full border border-success/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Extracted
                      </div>
                    )}
                    {stmt.status === 'failed' && (
                      <div className="flex flex-col items-end gap-1 max-w-xs">
                        <div className="flex items-center gap-2 text-error text-sm font-medium bg-error-subtle px-3 py-1.5 rounded-full border border-error/20">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failed
                        </div>
                        {stmt.error_message && (
                          <p className="text-xs text-error/80 text-right leading-snug" title={stmt.error_message}>
                            {stmt.error_message}
                          </p>
                        )}
                      </div>
                    )}
                    
                    <button 
                      onClick={() => viewTransactions(stmt.id)}
                      disabled={stmt.status !== 'completed'}
                      className="btn-secondary h-8 px-3 text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" /> {selectedStatementId === stmt.id ? 'Hide Details' : 'View Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded Transactions View */}
                <AnimatePresence>
                  {selectedStatementId === stmt.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border bg-bg-base"
                    >
                      {txnsLoading ? (
                        <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-text-disabled" /></div>
                      ) : (
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                              <tr className="text-xs text-text-secondary uppercase tracking-wider border-b border-border">
                                <th className="pb-3 px-3 font-medium">Date</th>
                                <th className="pb-3 px-3 font-medium">Description</th>
                                <th className="pb-3 px-3 font-medium text-right">Withdrawal</th>
                                <th className="pb-3 px-3 font-medium text-right">Deposit</th>
                                <th className="pb-3 px-3 font-medium text-right">Balance</th>
                                <th className="pb-3 px-3 font-medium text-center">Flags</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {transactions.map(txn => (
                                <tr key={txn.id} className={`hover:bg-bg-sunken ${txn.needs_manual_review || txn.has_math_error ? 'bg-warning-subtle/30' : ''}`}>
                                  <td className="py-3 px-3 text-text-primary font-mono text-xs">{new Date(txn.txn_date).toLocaleDateString()}</td>
                                  <td className="py-3 px-3 text-text-primary max-w-xs truncate" title={txn.description}>{txn.description}</td>
                                  <td className="py-3 px-3 text-text-primary font-mono text-xs text-right">{txn.withdrawal ? `₹${txn.withdrawal.toFixed(2)}` : '-'}</td>
                                  <td className="py-3 px-3 text-success font-mono text-xs text-right">{txn.deposit ? `₹${txn.deposit.toFixed(2)}` : '-'}</td>
                                  <td className="py-3 px-3 text-text-secondary font-mono text-xs text-right">₹{txn.balance?.toFixed(2)}</td>
                                  <td className="py-3 px-3 text-center">
                                    {(txn.needs_manual_review || txn.has_math_error) && (
                                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-warning bg-warning/10 px-2 py-0.5 rounded border border-warning/20" title="AI flagged this row for manual review">
                                        <AlertCircle className="w-3 h-3" /> Review
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {transactions.length === 0 && (
                                <tr><td colSpan={6} className="py-6 text-center text-text-secondary text-sm">No transactions found.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
