/**
 * ImportPanel — upload a Purchase Register (CSV/Excel), auto/manually map
 * columns, preview per-row validation, then inject rows into the EXISTING
 * Verification Grid. No AI credits are spent (deterministic parse).
 *
 * Project rules honored:
 *  - TanStack Query mutation with isError → <ErrorState> + Retry (no infinite spinner).
 *  - Heavy transforms memoized (useMemo/useCallback).
 *  - Credits-only gating: import is free of AI credits (no ProGate).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Copy, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  IMPORT_FIELDS,
  type ImportPreviewResponse,
  type ImportPreviewRow,
} from './importRow';

type ImportPanelProps = {
  activeClientId: string | null;
  onAddRows: (rows: ImportPreviewRow[]) => void;
};

async function fetchPreview(
  file: File,
  clientId: string,
  mapping: Record<string, string>,
): Promise<ImportPreviewResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required. Please log in again.');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_id', clientId);
  if (Object.keys(mapping).length > 0) {
    formData.append('mapping', JSON.stringify(mapping));
  }

  const response = await fetch(`${getApiUrl()}/api/import/purchase-register/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || `Preview failed (${response.status})`);
  }
  return response.json();
}

export function ImportPanel({ activeClientId, onAddRows }: ImportPanelProps) {
  const [fileState, setFileState] = useState<File | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { file: File; mapping: Record<string, string> }) => {
      if (!activeClientId) {
        return Promise.reject(new Error('Please select a client first.'));
      }
      return fetchPreview(vars.file, activeClientId, vars.mapping);
    },
  });

  const { mutate, data: preview, isPending, isError, error } = mutation;

  const runPreview = useCallback(
    (file: File, mapping: Record<string, string>) => {
      mutate({ file, mapping });
    },
    [mutate],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!activeClientId) {
        toast.error('Please select a client first.');
        return;
      }
      const file = accepted[0];
      if (!file) return;
      setFileState(file);
      setOverrides({});
      runPreview(file, {});
    },
    [activeClientId, runPreview],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
  });

  // Merge auto-detected mapping with user overrides for the dropdowns.
  const effectiveMapping = useMemo<Record<string, string>>(
    () => ({ ...(preview?.mapping ?? {}), ...overrides }),
    [preview?.mapping, overrides],
  );

  const handleMappingChange = useCallback(
    (field: string, header: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (header) next[field] = header;
        else delete next[field];
        return next;
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (fileState) {
          const merged = { ...(preview?.mapping ?? {}), ...overrides };
          if (header) merged[field] = header;
          else delete merged[field];
          runPreview(fileState, merged);
        }
      }, 600);
    },
    [fileState, overrides, preview?.mapping, runPreview],
  );

  const rowsToAdd = useMemo<ImportPreviewRow[]>(() => {
    if (!preview) return [];
    return preview.preview_rows.filter(
      (r) => r.status !== 'error' && (includeDuplicates || r.status !== 'duplicate'),
    );
  }, [preview, includeDuplicates]);

  const handleAddToGrid = useCallback(() => {
    if (rowsToAdd.length === 0) {
      toast.error('No rows to add.');
      return;
    }
    onAddRows(rowsToAdd);
    toast.success(`Added ${rowsToAdd.length} row${rowsToAdd.length > 1 ? 's' : ''} to the grid`);
  }, [rowsToAdd, onAddRows]);

  const summary = preview?.summary;
  const notPurchaseRegister =
    preview && preview.detected_doc_type !== 'purchase_register';

  return (
    <div className="p-6 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
      <div
        {...getRootProps()}
        className={cn(
          'w-full min-h-[180px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group text-center mb-4',
          isDragActive
            ? 'border-accent bg-accent-subtle'
            : 'border-border hover:border-accent hover:bg-bg-sunken bg-bg-base',
        )}
      >
        <input {...getInputProps()} />
        <div className="w-14 h-14 rounded-full bg-bg-sunken flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <UploadCloud className={cn('w-6 h-6', isDragActive ? 'text-accent' : 'text-text-secondary')} />
        </div>
        <p className="font-medium text-text-primary mb-1">Upload your Purchase Register</p>
        <p className="text-xs text-text-secondary">CSV or Excel — no scanning needed</p>
        {fileState && (
          <p className="text-[11px] text-accent mt-2 flex items-center gap-1">
            <FileSpreadsheet className="w-3 h-3" /> {fileState.name}
          </p>
        )}
      </div>

      {isPending && (
        <div className="flex items-center justify-center gap-2 text-text-secondary text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Parsing register…
        </div>
      )}

      {isError && (
        <ErrorState
          title="Couldn't read that file"
          message={error instanceof Error ? error.message : 'Preview failed. Please try again.'}
          onRetry={fileState ? () => runPreview(fileState, effectiveMapping) : undefined}
        />
      )}

      {preview && !isPending && !isError && (
        <div className="space-y-4">
          {notPurchaseRegister && (
            <div className="flex items-start gap-2 text-xs text-warning bg-warning-subtle border border-warning/20 rounded-md p-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This file looks like <strong>{preview.detected_doc_type.replace(/_/g, ' ')}</strong>, not a
                purchase register. Double-check the column mapping below before adding.
              </span>
            </div>
          )}

          {/* Summary chips */}
          {summary && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip icon={<CheckCircle2 className="w-3 h-3" />} label="Ready" value={summary.ready} tone="success" />
              <Chip icon={<AlertTriangle className="w-3 h-3" />} label="Needs review" value={summary.needs_review} tone="warning" />
              <Chip icon={<Copy className="w-3 h-3" />} label="Duplicates" value={summary.duplicates} tone="muted" />
              <Chip icon={<AlertTriangle className="w-3 h-3" />} label="Errors" value={summary.errors} tone="error" />
            </div>
          )}

          {/* Column mapping */}
          <div>
            <h3 className="font-medium text-xs text-text-secondary uppercase tracking-wider mb-2">
              Column mapping
            </h3>
            <div className="space-y-1.5">
              {IMPORT_FIELDS.map(({ field, label, required }) => {
                const unmapped = required && !effectiveMapping[field];
                return (
                  <div key={field} className="flex items-center gap-2">
                    <label
                      className={cn(
                        'text-xs w-36 shrink-0',
                        unmapped ? 'text-error font-medium' : 'text-text-secondary',
                      )}
                    >
                      {label}
                      {required && <span className="text-error"> *</span>}
                    </label>
                    <select
                      value={effectiveMapping[field] ?? ''}
                      onChange={(e) => handleMappingChange(field, e.target.value)}
                      className={cn(
                        'flex-1 bg-bg-sunken border rounded-md px-2 py-1 text-xs text-text-primary',
                        unmapped ? 'border-error' : 'border-border',
                      )}
                    >
                      <option value="">— not mapped —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeDuplicates}
              onChange={(e) => setIncludeDuplicates(e.target.checked)}
              className="rounded border-border"
            />
            Include {summary?.duplicates ?? 0} duplicate(s)
          </label>

          <button
            onClick={handleAddToGrid}
            disabled={rowsToAdd.length === 0}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add {rowsToAdd.length} row{rowsToAdd.length === 1 ? '' : 's'} to grid
          </button>
          {preview.truncated && (
            <p className="text-[11px] text-text-secondary text-center">
              Showing first {preview.preview_rows.length} of {preview.row_count} rows.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'error' | 'muted';
}) {
  const tones: Record<string, string> = {
    success: 'bg-success-subtle text-success border-success/20',
    warning: 'bg-warning-subtle text-warning border-warning/20',
    error: 'bg-error-subtle text-error border-error/20',
    muted: 'bg-bg-sunken text-text-secondary border-border',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md border', tones[tone])}>
      {icon}
      {value} {label}
    </span>
  );
}
