import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  UploadCloud,
  FileSpreadsheet,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useClient } from '../lib/ClientContext';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { exportTallyDocument, pushDocumentToTallyBridge } from '../lib/exportService';
import { ErrorState } from '../components/ui/ErrorState';

type DocTypeOption =
  | 'sales_register'
  | 'purchase_register'
  | 'bank_statement'
  | 'journal'
  | 'generic_table';

const DOC_TYPE_LABELS: Record<DocTypeOption, string> = {
  sales_register: 'Sales Register',
  purchase_register: 'Purchase Register',
  bank_statement: 'Bank Statement / Book',
  journal: 'Journal',
  generic_table: 'Generic Table',
};

const MAPPINGS_KEY = (clientId: string) => `khatalens_tally_mappings_${clientId}`;

type PreviewRow = {
  idx: number;
  date?: string;
  number?: string;
  vtype?: string;
  party?: string;
  narration?: string;
  dr: string;
  cr: string;
  balanced: boolean;
  confidence?: number;
};

function loadPersistedMappings(clientId: string | null): Record<string, string> {
  if (!clientId) return {};
  try {
    const raw = localStorage.getItem(MAPPINGS_KEY(clientId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedMappings(clientId: string | null, mappings: Record<string, string>) {
  if (!clientId) return;
  try {
    localStorage.setItem(MAPPINGS_KEY(clientId), JSON.stringify(mappings));
  } catch {
    /* ignore */
  }
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function TallyConverterPage() {
  const { activeClientId, refreshCredits } = useClient();
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocTypeOption>('purchase_register');
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [document, setDocument] = useState<any | null>(null);
  const [costCredits, setCostCredits] = useState<number | null>(null);
  const [bankLedger, setBankLedger] = useState('Bank Account');
  const [pdfPassword, setPdfPassword] = useState('');
  const [mappings, setMappings] = useState<Record<string, string>>(() =>
    loadPersistedMappings(activeClientId),
  );
  const [existingLedgersText, setExistingLedgersText] = useState('');
  const [report, setReport] = useState<any | null>(null);

  const vouchers = useMemo(() => document?.vouchers || [], [document]);
  const masters = useMemo(() => document?.masters || [], [document]);

  const existingLedgerOptions = useMemo(() => {
    return existingLedgersText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [existingLedgersText]);

  const previewRows = useMemo((): PreviewRow[] => {
    return vouchers.slice(0, 200).map((v: any, idx: number) => {
      const dr = (v.ledger_legs || [])
        .filter((l: any) => l.is_debit)
        .reduce((s: number, l: any) => s + Math.abs(l.amount || 0), 0);
      const cr = (v.ledger_legs || [])
        .filter((l: any) => !l.is_debit)
        .reduce((s: number, l: any) => s + Math.abs(l.amount || 0), 0);
      return {
        idx,
        date: v.date,
        number: v.number,
        vtype: v.vtype,
        party: v.party,
        narration: v.narration,
        dr: dr.toFixed(2),
        cr: cr.toFixed(2),
        balanced: Math.abs(dr - cr) < 0.02,
        confidence: v.confidence,
      };
    });
  }, [vouchers]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      if (!activeClientId) {
        toast.error('Select a client workspace first.');
        return;
      }

      setUploading(true);
      setError(null);
      setReport(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const form = new FormData();
        form.append('file', file);
        form.append('client_id', activeClientId);
        form.append('doc_type', docType);
        form.append('bank_ledger', bankLedger);
        if (pdfPassword) form.append('pdf_password', pdfPassword);

        const res = await fetch(`${getApiUrl()}/api/tally-converter/detect`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.detail || `Upload failed (${res.status})`);
        }

        setDocument(json.document);
        setDetectedType(json.detected_doc_type || json.doc_type);
        setDocType((json.doc_type || docType) as DocTypeOption);
        setConfidence(json.confidence ?? null);
        setCostCredits(json.cost_credits ?? null);
        const persisted = loadPersistedMappings(activeClientId);
        setMappings(persisted);
        refreshCredits();
        toast.success(
          `Parsed ${json.row_count ?? json.document?.vouchers?.length ?? 0} rows` +
            (json.cost_credits ? ` (−${json.cost_credits} credits)` : ''),
        );
      } catch (e: any) {
        setError(e?.message || 'Failed to convert file');
        toast.error(e?.message || 'Failed to convert file');
      } finally {
        setUploading(false);
      }
    },
    [activeClientId, docType, bankLedger, pdfPassword, refreshCredits],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading || !activeClientId,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
  });

  const updateMapping = useCallback(
    (fromName: string, toName: string) => {
      setMappings((prev) => {
        const next = { ...prev };
        if (!toName) delete next[fromName];
        else next[fromName] = toName;
        savePersistedMappings(activeClientId, next);
        return next;
      });
    },
    [activeClientId],
  );

  const handleExport = useCallback(async () => {
    if (!document) {
      toast.error('Upload a file first.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      // If user changed doc type after detect, re-tag document
      const docPayload = {
        ...document,
        doc_type: docType,
      };
      const result = await exportTallyDocument(docPayload, mappings, activeClientId);
      setReport(result.report);
      if (result.document) {
        setDocument(result.document);
      }

      const errors = (result.report?.issues || []).filter((i: any) => i.severity === 'error');
      if (errors.length > 0 && !result.xml) {
        toast.error('Validation failed — fix issues before import.');
        return;
      }
      if (result.xml) {
        downloadBlob(result.xml, 'Tally_Converter_Export.xml', 'application/xml');
      }
      if (result.excel_template) {
        downloadBlob(result.excel_template, 'Tally_Converter_Template.csv', 'text/csv');
      }
      if (result.report?.ok) {
        toast.success(
          `Ready for Tally: ${result.report.voucher_count} vouchers, ${result.report.master_create_count} masters to create`,
        );
      } else {
        toast.error('Exported with validation errors — review the report.');
      }
    } catch (e: any) {
      setError(e?.message || 'Export failed');
      toast.error(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [document, docType, mappings, activeClientId]);

  const handlePushToTally = useCallback(async () => {
    if (!document || !activeClientId) {
      toast.error('Upload a file first.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const docPayload = { ...document, doc_type: docType };
      const job = await pushDocumentToTallyBridge(activeClientId, docPayload, mappings, {
        downloadXml: false,
      });
      toast.success(
        job.idempotent
          ? `Job already ${job.job_status}. Bridge will push when online.`
          : `Queued for Tally Bridge (${job.job_id.slice(0, 8)}…)`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Push to Tally failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }, [document, docType, mappings, activeClientId]);

  if (!activeClientId) {
    return (
      <div className="p-8 text-center text-text-secondary">
        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p>Select a client from the sidebar to use the Tally Converter.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary mb-1">Tally Converter</h1>
        <p className="text-sm text-text-secondary">
          Upload Sales / Purchase registers, bank statements, or journals (PDF / Excel / CSV). We
          build balanced TallyPrime &amp; ERP 9 import XML with auto-created masters (optional
          mapping).
        </p>
      </div>

      {error && (
        <ErrorState title="Converter error" message={error} onRetry={() => setError(null)} />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Document type
          </label>
          <select
            className="input w-full"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocTypeOption)}
            data-testid="tally-doc-type"
          >
            {(Object.keys(DOC_TYPE_LABELS) as DocTypeOption[]).map((k) => (
              <option key={k} value={k}>
                {DOC_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
          {detectedType && (
            <p className="text-xs text-text-secondary">
              Detected: <span className="font-medium text-text-primary">{detectedType}</span>
              {confidence != null && ` (${Math.round(confidence * 100)}% confidence)`}
              {costCredits != null && ` · charged ${costCredits} credits`}
            </p>
          )}
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide pt-2">
            Bank ledger name (for statements)
          </label>
          <input
            className="input w-full"
            value={bankLedger}
            onChange={(e) => setBankLedger(e.target.value)}
          />
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide pt-2">
            PDF password (if any)
          </label>
          <input
            type="password"
            className="input w-full"
            value={pdfPassword}
            onChange={(e) => setPdfPassword(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div
          {...getRootProps()}
          className={`card p-6 border-dashed border-2 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-accent bg-accent/5' : 'border-border'
          }`}
          data-testid="tally-converter-dropzone"
        >
          <input {...getInputProps()} />
          {uploading ? (
            <Loader2 className="w-10 h-10 animate-spin text-accent mb-3" />
          ) : (
            <UploadCloud className="w-10 h-10 text-accent mb-3" />
          )}
          <p className="font-medium text-text-primary">
            {uploading ? 'Parsing…' : 'Drop PDF / Excel / CSV here'}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Sales register · Purchase register · Bank statement · Journal
          </p>
        </div>
      </div>

      {document && (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold text-text-primary flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Preview ({vouchers.length} vouchers)
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={handlePushToTally}
                  disabled={exporting || vouchers.length === 0}
                  data-testid="tally-converter-push"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Push to Tally
                </button>
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-2"
                  onClick={handleExport}
                  disabled={exporting || vouchers.length === 0}
                  data-testid="tally-converter-export"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download XML
                </button>
              </div>
            </div>

            {(document.warnings || []).length > 0 && (
              <div className="mb-3 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 rounded p-2 space-y-1">
                {(document.warnings as string[]).map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto max-h-80 custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-surface">
                  <tr className="text-left text-xs text-text-secondary border-b border-border">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">No</th>
                    <th className="py-2 pr-2">Party</th>
                    <th className="py-2 pr-2 text-right">Dr</th>
                    <th className="py-2 pr-2 text-right">Cr</th>
                    <th className="py-2">Bal</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r: PreviewRow) => (
                    <tr key={r.idx} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{r.date || '—'}</td>
                      <td className="py-1.5 pr-2">{r.vtype}</td>
                      <td className="py-1.5 pr-2">{r.number || '—'}</td>
                      <td className="py-1.5 pr-2 max-w-[12rem] truncate">{r.party || '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.dr}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.cr}</td>
                      <td className="py-1.5">
                        {r.balanced ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vouchers.length === 0 && (
                <p className="text-sm text-text-secondary py-6 text-center">
                  No vouchers parsed. Try Excel/CSV for registers, or force document type.
                </p>
              )}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-text-primary">Masters — auto-create / map</h2>
            <p className="text-xs text-text-secondary">
              By default we create missing ledgers under the suggested Tally group. Optionally map to
              an existing ledger name in your company (paste a list below). Mappings persist per
              client.
            </p>
            <textarea
              className="input w-full min-h-[4.5rem] font-mono text-xs"
              placeholder="Paste existing Tally ledger names (one per line)…"
              value={existingLedgersText}
              onChange={(e) => setExistingLedgersText(e.target.value)}
            />
            <div className="overflow-x-auto max-h-64 custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-secondary border-b border-border">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Parent</th>
                    <th className="py-2">Map to existing (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {masters
                    .filter((m: any) => m.kind === 'ledger' || !m.kind)
                    .map((m: any) => (
                      <tr key={m.name} className="border-b border-border/50">
                        <td className="py-1.5 pr-2">{m.name}</td>
                        <td className="py-1.5 pr-2 text-text-secondary">{m.parent}</td>
                        <td className="py-1.5">
                          {existingLedgerOptions.length > 0 ? (
                            <select
                              className="input text-xs py-1"
                              value={mappings[m.name] || ''}
                              onChange={(e) => updateMapping(m.name, e.target.value)}
                            >
                              <option value="">— Auto-create —</option>
                              {existingLedgerOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="input text-xs py-1 w-full"
                              placeholder="Exact Tally ledger name"
                              value={mappings[m.name] || ''}
                              onChange={(e) => updateMapping(m.name, e.target.value)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {report && (
            <div className="card p-4" data-testid="tally-validation-report">
              <h2 className="font-semibold text-text-primary mb-2">Validation report</h2>
              <p className="text-sm text-text-secondary mb-2">
                {report.ok ? 'Ready to import' : 'Issues found'} · {report.voucher_count} vouchers ·{' '}
                {report.master_create_count} masters to create · {report.auto_round_off_applied}{' '}
                auto round-off
              </p>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {(report.issues || []).map((issue: any, i: number) => (
                  <li
                    key={i}
                    className={issue.severity === 'error' ? 'text-error' : 'text-amber-600'}
                  >
                    [{issue.severity}] {issue.message}
                  </li>
                ))}
                {(report.issues || []).length === 0 && (
                  <li className="text-success">No issues — Dr = Cr on all vouchers.</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
