import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, Loader2, UploadCloud, Check, X, RotateCcw, Download, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useClient } from '../lib/ClientContext';
import { getApiUrl } from '../lib/api';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { downloadClaimPack } from '../lib/claimPackDownload';

type ImsRecord = {
  id: string;
  supplier_gstin?: string;
  invoice_number?: string;
  invoice_date?: string;
  taxable_value?: number;
  ims_action: string;
  deemed_accept_by?: string;
  days_to_deemed?: number | null;
  action_reason?: string;
};

type ImsResponse = {
  status: string;
  period: string;
  counts: { pending: number; accepted: number; rejected: number };
  deemed_soon: number;
  total: number;
  records: ImsRecord[];
};

export default function ImsCockpitPage() {
  const { activeClientId } = useClient();
  const queryClient = useQueryClient();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState(`${currentMonth}-${currentYear}`);
  const [isUploading, setIsUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isActing, setIsActing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ims', activeClientId, period],
    queryFn: async (): Promise<ImsResponse> => {
      if (!activeClientId) throw new Error('No client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const qs = new URLSearchParams({ client_id: activeClientId, period });
      const response = await fetch(`${getApiUrl()}/api/ims?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to load IMS');
      }
      return response.json();
    },
    enabled: !!activeClientId,
  });

  const rows = data?.records ?? [];
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  const cards = useMemo(
    () => [
      { label: 'Pending', value: data?.counts?.pending ?? 0 },
      { label: 'Accepted', value: data?.counts?.accepted ?? 0 },
      { label: 'Rejected', value: data?.counts?.rejected ?? 0 },
      { label: 'Deemed ≤7 days', value: data?.deemed_soon ?? 0 },
    ],
    [data],
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeClientId) return;
      setIsUploading(true);
      toast.loading('Uploading IMS JSON…', { id: 'ims-upload' });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Authentication required');
        const form = new FormData();
        form.append('file', file);
        form.append('client_id', activeClientId);
        form.append('period', period);
        const response = await fetch(`${getApiUrl()}/api/ims/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || 'Upload failed');
        }
        const body = await response.json();
        toast.success(body.message || 'IMS loaded', { id: 'ims-upload' });
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: ['ims', activeClientId, period] });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Upload failed', { id: 'ims-upload' });
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    },
    [activeClientId, period, queryClient],
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const runBulk = async (action: 'accepted' | 'rejected' | 'pending') => {
    if (!activeClientId || selected.size === 0) return;
    setIsActing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const response = await fetch(`${getApiUrl()}/api/ims/bulk-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: activeClientId,
          period,
          ids: Array.from(selected),
          action,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Bulk action failed');
      }
      toast.success(`Marked ${selected.size} as ${action}`);
      setSelected(new Set());
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setIsActing(false);
    }
  };

  const handleDownloadPack = async () => {
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
  };

  if (!activeClientId) {
    return (
      <div className="p-8 text-center text-text-secondary h-[40vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md border-border">
          <AlertCircle className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">No Client Selected</h2>
          <p>Select a client to manage IMS Accept / Reject / Pending.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-accent" /> IMS Cockpit
          </h1>
          <p className="text-text-secondary">
            Upload portal IMS JSON, bulk Accept/Reject, track deemed-acceptance countdown. No LLM.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="month"
            value={period.split('-').reverse().join('-')}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-');
              if (y && m) setPeriod(`${m}-${y}`);
            }}
            className="px-4 py-2 bg-bg-surface border border-border rounded-lg text-sm text-text-primary focus:border-accent outline-none"
          />
          <div className="relative">
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            <button type="button" className="btn-primary flex items-center gap-2" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Upload IMS JSON
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadPack}
            disabled={isDownloading}
            className="px-4 py-2 bg-bg-surface border border-border rounded-lg text-sm flex items-center gap-2"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Claim pack
          </button>
        </div>
      </div>

      {isError ? (
        <ErrorState title="Failed to load IMS" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-bg-surface border border-border rounded-xl p-4">
                <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">{c.label}</p>
                <p className="text-2xl font-semibold text-text-primary">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={isActing || selected.size === 0}
              onClick={() => runBulk('accepted')}
              className="px-3 py-1.5 text-sm rounded-lg border border-border flex items-center gap-1 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Accept
            </button>
            <button
              type="button"
              disabled={isActing || selected.size === 0}
              onClick={() => runBulk('rejected')}
              className="px-3 py-1.5 text-sm rounded-lg border border-border flex items-center gap-1 disabled:opacity-50"
            >
              <X className="w-4 h-4" /> Reject
            </button>
            <button
              type="button"
              disabled={isActing || selected.size === 0}
              onClick={() => runBulk('pending')}
              className="px-3 py-1.5 text-sm rounded-lg border border-border flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> Pending
            </button>
            <span className="text-sm text-text-secondary ml-2">
              {selected.size} selected{isFetching ? ' · refreshing…' : ''}
            </span>
          </div>

          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase text-text-secondary border-b border-border items-center">
              <div className="col-span-1">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAllVisible}
                  aria-label="Select all"
                />
              </div>
              <div className="col-span-3">GSTIN</div>
              <div className="col-span-2">Invoice</div>
              <div className="col-span-2">Action</div>
              <div className="col-span-2">Deemed by</div>
              <div className="col-span-2 text-right">Days left</div>
            </div>
            {rows.length === 0 ? (
              <div className="p-10 text-center text-text-secondary text-sm">
                No IMS records for this period. Upload a portal JSON export.
              </div>
            ) : (
              <div ref={parentRef} className="h-[420px] overflow-auto">
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((vRow) => {
                    const rec = rows[vRow.index];
                    return (
                      <div
                        key={rec.id}
                        className="grid grid-cols-12 gap-2 px-4 items-center text-sm border-b border-border/60 absolute left-0 w-full"
                        style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
                      >
                        <div className="col-span-1">
                          <input
                            type="checkbox"
                            checked={selected.has(rec.id)}
                            onChange={() => toggleRow(rec.id)}
                            aria-label={`Select ${rec.invoice_number}`}
                          />
                        </div>
                        <div className="col-span-3 truncate font-mono text-xs">{rec.supplier_gstin}</div>
                        <div className="col-span-2 truncate">{rec.invoice_number}</div>
                        <div className="col-span-2">
                          <span className="text-xs px-2 py-0.5 rounded border border-border">{rec.ims_action}</span>
                        </div>
                        <div className="col-span-2 text-xs text-text-secondary">{rec.deemed_accept_by || '—'}</div>
                        <div className="col-span-2 text-right text-xs">
                          {rec.days_to_deemed == null ? '—' : rec.days_to_deemed}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
