import { useState, useEffect, useCallback, memo  } from "react";
import { useClient } from '../lib/ClientContext';
import { supabase } from '../lib/supabase';
import { Play, CheckCircle, XCircle, RotateCcw, Building2, Loader2, Network, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

// --- Memoized Components ---

const SuggestionCard = memo(({ match, actionLoading, handleAction }: { match: any, actionLoading: string | null, handleAction: (id: string, action: 'approve'|'reject'|'undo') => void }) => {
  return (
    <div className="card p-5 border-l-4 border-l-accent flex flex-col lg:flex-row gap-6 hover:shadow-lg transition-shadow duration-300">
      {/* Invoice Side */}
      <div className="flex-1 space-y-2">
        <div className="text-xs uppercase tracking-wider font-bold text-text-secondary">Invoice Data</div>
        {match.invoices ? (
          <div className="bg-bg-sunken p-4 rounded-xl border border-border">
            <div className="font-medium text-text-primary">{match.invoices.supplier_name || match.invoices.buyer_name}</div>
            <div className="text-sm text-text-secondary flex justify-between mt-2">
              <span>{match.invoices.invoice_number || 'N/A'}</span>
              <span className="font-mono text-text-primary">₹{(match.invoices.total_amount || 0).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-sunken p-4 rounded-xl border border-border text-text-secondary italic text-sm">
            No invoice linked (Advance / Unallocated)
          </div>
        )}
      </div>

      <div className="hidden lg:flex flex-col items-center justify-center">
        <div className="badge bg-accent-subtle text-accent border border-accent/20 mb-2">{match.match_type}</div>
        <ArrowRight className="w-5 h-5 text-text-disabled" />
        <div className="text-xs font-mono font-medium text-text-secondary mt-1">₹{match.allocated_amount?.toFixed(2)}</div>
      </div>

      {/* Bank Txn Side */}
      <div className="flex-1 space-y-2">
        <div className="text-xs uppercase tracking-wider font-bold text-text-secondary">Bank Transaction</div>
        {match.bank_transactions ? (
          <div className="bg-bg-sunken p-4 rounded-xl border border-border">
            <div className="font-medium text-text-primary truncate" title={match.bank_transactions.description}>
              {match.bank_transactions.description}
            </div>
            <div className="text-sm text-text-secondary flex justify-between mt-2">
              <span>{new Date(match.bank_transactions.txn_date).toLocaleDateString()}</span>
              <span className="font-mono text-text-primary">
                {match.bank_transactions.withdrawal ? `Withdrawal: ₹${match.bank_transactions.withdrawal.toFixed(2)}` : `Deposit: ₹${match.bank_transactions.deposit?.toFixed(2)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-sunken p-4 rounded-xl border border-border text-error italic text-sm">
            Error: Missing bank transaction
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-row lg:flex-col justify-end gap-2 shrink-0">
        <button 
          onClick={() => handleAction(match.id, 'approve')}
          disabled={actionLoading === match.id}
          className="btn-primary w-full lg:w-32 bg-success hover:bg-success/90 border-success text-white transition-colors duration-200"
        >
          {actionLoading === match.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Approve
        </button>
        <button 
          onClick={() => handleAction(match.id, 'reject')}
          disabled={actionLoading === match.id}
          className="btn-secondary w-full lg:w-32 text-error hover:bg-error-subtle hover:border-error/30 transition-colors duration-200"
        >
          {actionLoading === match.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Reject
        </button>
      </div>
    </div>
  );
});
SuggestionCard.displayName = 'SuggestionCard';

const HistoryCard = memo(({ match, actionLoading, handleAction }: { match: any, actionLoading: string | null, handleAction: (id: string, action: 'approve'|'reject'|'undo') => void }) => {
  return (
    <div className="card p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-success-subtle flex items-center justify-center shrink-0">
          <CheckCircle className="w-5 h-5 text-success" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary text-sm">
              {match.invoices?.supplier_name || 'Invoice'}
            </span>
            <ArrowRight className="w-3 h-3 text-text-disabled" />
            <span className="font-medium text-text-primary text-sm truncate max-w-[200px]" title={match.bank_transactions?.description}>
              {match.bank_transactions?.description}
            </span>
          </div>
          <div className="text-xs text-text-secondary mt-1 flex items-center gap-2">
            <span className="badge bg-bg-base border-border text-text-secondary text-[10px]">{match.match_type}</span>
            <span className="font-mono">Allocated: ₹{match.allocated_amount?.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <button 
        onClick={() => handleAction(match.id, 'undo')}
        disabled={actionLoading === match.id}
        className="btn-secondary px-3 text-xs shrink-0 transition-colors duration-200"
      >
        {actionLoading === match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Undo
      </button>
    </div>
  );
});
HistoryCard.displayName = 'HistoryCard';

// --- Main Page ---

export default function BankReconcilePage() {
  const { activeClientId } = useClient();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'history'>('suggestions');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningEngine, setRunningEngine] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!activeClientId) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const res = await fetch(`${apiUrl}/api/bank-reconcile/suggestions/${activeClientId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSuggestions(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  const fetchHistory = useCallback(async () => {
    if (!activeClientId) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const res = await fetch(`${apiUrl}/api/bank-reconcile/history/${activeClientId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.status === 'success') {
        setHistory(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    if (activeTab === 'suggestions') {
      fetchSuggestions();
    } else {
      fetchHistory();
    }
  }, [activeTab, fetchSuggestions, fetchHistory]);

  const runEngine = useCallback(async () => {
    if (!activeClientId) return;
    try {
      setRunningEngine(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const res = await fetch(`${apiUrl}/api/bank-reconcile/run`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ client_id: activeClientId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Engine run failed');
      
      toast.success(json.message || 'AI Matching Engine complete.');
      fetchSuggestions();
    } catch (e: any) {
      toast.error(e.message || 'Failed to run matching engine.');
    } finally {
      setRunningEngine(false);
    }
  }, [activeClientId, fetchSuggestions]);

  const handleAction = useCallback(async (matchId: string, action: 'approve' | 'reject' | 'undo') => {
    try {
      setActionLoading(matchId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const res = await fetch(`${apiUrl}/api/bank-reconcile/${action}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ match_id: matchId })
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `Action ${action} failed`);
      
      toast.success(json.message || `Match ${action}d successfully`);
      
      if (action === 'undo') {
        fetchHistory();
      } else {
        fetchSuggestions();
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to ${action} match.`);
    } finally {
      setActionLoading(null);
    }
  }, [fetchHistory, fetchSuggestions]);

  if (!activeClientId) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center h-full">
        <div className="text-center p-8 bg-bg-surface border border-border rounded-2xl max-w-md">
          <Building2 className="w-12 h-12 text-text-disabled mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold text-text-primary mb-2">No Client Selected</h2>
          <p className="text-text-secondary text-sm">Select a client to view reconciliation data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary mb-1">Bank Reconciliation</h1>
          <p className="text-sm text-text-secondary">AI-powered 2-way matching between invoices and bank transactions.</p>
        </div>
        <button 
          onClick={runEngine} 
          disabled={runningEngine}
          className="btn-primary shrink-0 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent via-accent-light to-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center gap-2">
            {runningEngine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {runningEngine ? 'Running Engine...' : 'Run AI Match Engine'}
          </div>
        </button>
      </div>

      <div className="flex space-x-1 bg-bg-sunken p-1 rounded-xl max-w-md border border-border">
        <button
          className={`flex-1 flex items-center justify-center py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${activeTab === 'suggestions' ? 'bg-bg-surface shadow-sm text-text-primary border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Suggestions <span className="ml-2 bg-accent/10 text-accent px-2 py-0.5 rounded-full text-xs font-bold">{suggestions.length || 0}</span>
        </button>
        <button
          className={`flex-1 flex items-center justify-center py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${activeTab === 'history' ? 'bg-bg-surface shadow-sm text-text-primary border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          onClick={() => setActiveTab('history')}
        >
          Undo History
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : activeTab === 'suggestions' ? (
        <div className="space-y-4">
          {suggestions.length === 0 ? (
            <div className="text-center p-12 bg-bg-surface border border-border rounded-2xl">
              <Network className="w-12 h-12 text-text-disabled mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary">No Suggestions Found</h3>
              <p className="text-text-secondary mt-1">Run the AI Match Engine or upload more data.</p>
            </div>
          ) : (
            suggestions.map(match => (
              <SuggestionCard 
                key={match.id} 
                match={match} 
                actionLoading={actionLoading} 
                handleAction={handleAction} 
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center p-12 bg-bg-surface border border-border rounded-2xl text-text-secondary">
              No approved matches found.
            </div>
          ) : (
            history.map(match => (
              <HistoryCard 
                key={match.id} 
                match={match} 
                actionLoading={actionLoading} 
                handleAction={handleAction} 
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
