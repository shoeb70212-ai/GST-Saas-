import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, ShieldAlert, Loader2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useClient } from '../lib/ClientContext';
import { getApiUrl } from '../lib/api';
import { formatCurrency } from '../utils/format';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { downloadClaimPack } from '../lib/claimPackDownload';

type RiskInvoice = {
  id: string;
  supplier_name?: string;
  supplier_gstin?: string;
  invoice_number?: string;
  invoice_date?: string;
  itc_eligibility: string;
  itc_risk_flags: string[];
  itc_amount: number;
  taxable_amount?: number;
  recon_status?: string;
};

type ItcRiskResponse = {
  status: string;
  period: string | null;
  blocked_itc_total: number;
  buckets: Record<string, { count: number; amount: number }>;
  invoices: RiskInvoice[];
};

const FLAG_LABELS: Record<string, string> = {
  MISSING_IN_2B: 'Missing in 2B',
  VENDOR_CANCELLED: 'Vendor cancelled',
  VENDOR_SUSPENDED: 'Vendor suspended',
  SECTION_17_5: 'Sec 17(5)',
};

export default function ItcRiskPage() {
  const { activeClientId } = useClient();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState(`${currentMonth}-${currentYear}`);
  const [isDownloading, setIsDownloading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const handleDownloadPack = useCallback(async () => {
    if (!activeClientId) return;
    setIsDownloading(true);
    try {
      await downloadClaimPack(activeClientId, period);
      toast.success('Claim pack downloaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [activeClientId, period]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['itc-risk', activeClientId, period],
    queryFn: async (): Promise<ItcRiskResponse> => {
      if (!activeClientId) throw new Error('No client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const apiUrl = getApiUrl();
      const qs = new URLSearchParams({
        client_id: activeClientId,
        period,
        recompute: 'true',
      });
      const response = await fetch(`${apiUrl}/api/itc-risk?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to load ITC risk');
      }
      return response.json();
    },
    enabled: !!activeClientId,
  });

  const rows = data?.invoices ?? [];
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const cards = useMemo(() => {
    const b = data?.buckets;
    return [
      {
        label: 'Blocked ITC (all risk)',
        amount: data?.blocked_itc_total ?? 0,
        hint: 'Sum of missing-2B + blocked vendor + 17(5)',
      },
      {
        label: 'Missing in 2B',
        amount: b?.missing_2b?.amount ?? 0,
        count: b?.missing_2b?.count ?? 0,
      },
      {
        label: 'Cancelled / blocked vendor',
        amount: b?.blocked_vendor?.amount ?? 0,
        count: b?.blocked_vendor?.count ?? 0,
      },
      {
        label: 'Sec 17(5) tagged',
        amount: b?.ineligible_17_5?.amount ?? 0,
        count: b?.ineligible_17_5?.count ?? 0,
      },
    ];
  }, [data]);

  if (!activeClientId) {
    return (
      <div className="p-8 text-center text-text-secondary h-[40vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md border-border">
          <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">No Client Selected</h2>
          <p>Select a client to view ITC-at-Risk for a GSTR period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-accent" /> ITC at Risk
          </h1>
          <p className="text-text-secondary">
            Deterministic flags from GSTR-2B reconcile and GSTIN status — no LLM.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period.split('-').reverse().join('-')}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-');
              if (y && m) setPeriod(`${m}-${y}`);
            }}
            className="px-4 py-2 bg-bg-surface border border-border rounded-lg text-sm text-text-primary focus:border-accent outline-none"
          />
          <button
            type="button"
            onClick={handleDownloadPack}
            disabled={isDownloading}
            className="px-4 py-2 bg-bg-surface border border-border rounded-lg text-sm flex items-center gap-2"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Claim pack
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-primary flex items-center gap-2"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {isError ? (
        <ErrorState title="Failed to load ITC risk" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-bg-surface border border-border rounded-xl p-4">
                <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">{c.label}</p>
                <p className="text-xl font-semibold text-text-primary">{formatCurrency(c.amount)}</p>
                {'count' in c && c.count !== undefined ? (
                  <p className="text-xs text-text-secondary mt-1">{c.count} invoice(s)</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex justify-between items-center">
              <h2 className="font-semibold text-text-primary">Risk invoices</h2>
              <span className="text-sm text-text-secondary">{rows.length} shown</span>
            </div>
            {rows.length === 0 ? (
              <div className="p-10 text-center text-text-secondary text-sm">
                No risk-tagged invoices for this period. Run GSTR-2B reconcile first.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase text-text-secondary border-b border-border">
                  <div className="col-span-3">Supplier</div>
                  <div className="col-span-2">Invoice</div>
                  <div className="col-span-2">Eligibility</div>
                  <div className="col-span-3">Flags</div>
                  <div className="col-span-2 text-right">ITC ₹</div>
                </div>
                <div ref={parentRef} className="h-[420px] overflow-auto">
                  <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                    {virtualizer.getVirtualItems().map((vRow) => {
                      const inv = rows[vRow.index];
                      return (
                        <div
                          key={inv.id}
                          className="grid grid-cols-12 gap-2 px-4 items-center text-sm border-b border-border/60 absolute left-0 w-full"
                          style={{
                            height: vRow.size,
                            transform: `translateY(${vRow.start}px)`,
                          }}
                        >
                          <div className="col-span-3 truncate text-text-primary">
                            {inv.supplier_name || '—'}
                            <div className="text-xs text-text-secondary truncate">{inv.supplier_gstin}</div>
                          </div>
                          <div className="col-span-2 truncate">{inv.invoice_number || '—'}</div>
                          <div className="col-span-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-bg-base border border-border">
                              {inv.itc_eligibility}
                            </span>
                          </div>
                          <div className="col-span-3 flex flex-wrap gap-1">
                            {(inv.itc_risk_flags || []).map((f) => (
                              <span
                                key={f}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary"
                              >
                                {FLAG_LABELS[f] || f}
                              </span>
                            ))}
                          </div>
                          <div className="col-span-2 text-right font-medium">
                            {formatCurrency(inv.itc_amount || 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
