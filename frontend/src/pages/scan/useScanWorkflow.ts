/**
 * Scan workflow: upload, extract, auto-save, export.
 * Preserves clientId binding for auto-save (0124b62): never close over stale fileStates alone.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { useScanContext } from '../../lib/ScanContext';
import { DEFAULT_COLUMNS } from '../../lib/constants';
import type { FileState, InvoiceData, LineItem } from '../../lib/ScanContext';
import { useClient } from '../../lib/ClientContext';
import { saveSingleInvoiceToDb } from './saveInvoice';

function compressImage(file: File, maxWidth: number, maxHeight: number): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                type: 'image/webp',
                lastModified: Date.now(),
              });
              resolve(newFile);
            } else {
              resolve(file);
            }
          },
          'image/webp',
          0.8
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export function useScanWorkflow() {
  const { fileStates, setFileStates, visibleColumns, setVisibleColumns } = useScanContext();
  const { activeClientId, refreshCredits } = useClient();
  const queryClient = useQueryClient();

  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');

  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportPrefs, setExportPrefs] = useState<{ columns: string[], includeItems: boolean }>({
    columns: DEFAULT_COLUMNS,
    includeItems: true
  });

  const [showSettings, setShowSettings] = useState(false);
  const [uploadMode, setUploadMode] = useState<'single' | 'zip'>('single');
  const settingsRef = useRef<HTMLDivElement>(null);
  const activeClientIdRef = useRef<string | null>(activeClientId);
  const prevClientIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeClientIdRef.current = activeClientId;
  }, [activeClientId]);

  // Clear scan queue when switching clients so saves don't target the wrong client
  useEffect(() => {
    if (prevClientIdRef.current !== null && prevClientIdRef.current !== activeClientId) {
      setFileStates([]);
    }
    prevClientIdRef.current = activeClientId;
  }, [activeClientId, setFileStates]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchExportPrefs = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('export_columns, export_include_items')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        setExportPrefs({
          columns: profile.export_columns || DEFAULT_COLUMNS,
          includeItems: profile.export_include_items ?? true
        });
      }
    };
    fetchExportPrefs();
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      localStorage.setItem('khatalens_columns', JSON.stringify(next));
      return next;
    });
  };

  const fetchPendingBatchInvoices = useCallback(async () => {
    if (!activeClientId) return;
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', activeClientId)
      .eq('processing_status', 'pending');

    if (data && data.length > 0) {
      setFileStates(prev => {
        const newFiles = data.map(dbInv => {
          if (prev.some(f => f.id === dbInv.id)) return null;
          return {
            id: dbInv.id,
            file: new File([""], dbInv.file_name || "batch_file"),
            previewUrl: null,
            isScanning: true,
            extractedData: null,
            error: null,
            savedToCloud: false,
            isBatch: true
          };
        }).filter(Boolean);
        if (newFiles.length > 0) {
          return [...prev, ...newFiles as FileState[]];
        }
        return prev;
      });
    }
  }, [activeClientId, setFileStates]);

  useEffect(() => {
    if (!activeClientId) return;
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `client_id=eq.${activeClientId}` },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (updated.processing_status === 'completed' || updated.processing_status === 'failed') {
            setFileStates(prev => prev.map(fs => {
              if (fs.id === updated.id) {
                if (updated.processing_status === 'failed') {
                  return { ...fs, isScanning: false, error: (updated.error_message as string) || 'Batch processing failed' };
                } else {
                  return {
                    ...fs,
                    isScanning: false,
                    savedToCloud: true,
                    extractedData: {
                      Supplier_Name: updated.supplier_name,
                      Invoice_Number: updated.invoice_number,
                      Total_Amount: updated.total_amount,
                      Extraction_State: updated.extraction_state,
                      Confidence_Score: updated.confidence_score,
                    } as InvoiceData
                  };
                }
              }
              return fs;
            }));
          }
        }
      )
      .subscribe();

    fetchPendingBatchInvoices();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClientId, fetchPendingBatchInvoices, setFileStates]);

  const handleZipUpload = useCallback(async (file: File) => {
    if (!activeClientId) {
      toast.error("Please select a client first.");
      return;
    }

    // Proxy (nginx) and backend reject oversized ZIPs with 413. Warn early.
    const MAX_ZIP_BYTES = 80 * 1024 * 1024; // compressed ZIP soft limit (backend: 50MB uncompressed)
    if (file.size > MAX_ZIP_BYTES) {
      toast.error(
        `ZIP is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Split into batches under ~80 MB compressed (50 MB uncompressed of images/PDFs).`,
      );
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', activeClientId);

    try {
      const apiUrl = getApiUrl();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      toast.loading("Uploading ZIP batch...", { id: "zip-upload" });

      const response = await fetch(`${apiUrl}/api/upload-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errBody = await response.json();
          detail = typeof errBody?.detail === "string" ? errBody.detail : "";
        } catch {
          /* ignore non-JSON 413 from nginx */
        }
        if (response.status === 413) {
          throw new Error(
            detail ||
              "ZIP too large for the server (413). Split into smaller ZIPs (under ~50 MB of images/PDFs), or ask admin to raise proxy body size.",
          );
        }
        if (response.status === 404) {
          throw new Error("Batch upload API not found (404). Backend may need a redeploy.");
        }
        if (response.status === 402) {
          throw new Error(detail || "Insufficient credits for this ZIP batch.");
        }
        if (response.status === 400) {
          throw new Error(detail || "Invalid ZIP or no supported invoice files found.");
        }
        throw new Error(detail || `Failed to upload ZIP (${response.status})`);
      }
      const resData = await response.json();

      toast.success(`Queued ${resData.queued_ids?.length || 0} invoices for background processing!`, { id: "zip-upload" });
      fetchPendingBatchInvoices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload ZIP";
      toast.error(message, { id: "zip-upload" });
    }
  }, [activeClientId, fetchPendingBatchInvoices]);

  const autoSaveInvoiceRef = useRef<(fileId: string, fs: FileState, data: InvoiceData, clientId: string) => Promise<void>>(async () => {});

  const scanFile = useCallback(async (item: FileState) => {
    const clientId = item.clientId ?? activeClientIdRef.current;
    if (!clientId) {
      setFileStates(prev => prev.map(f =>
        f.id === item.id ? { ...f, error: 'No client selected', isScanning: false } : f
      ));
      return;
    }

    try {
      const processedFile = await compressImage(item.file, 1536, 1536);
      const formData = new FormData();
      formData.append('file', processedFile);
      if (pdfPassword) {
        formData.append('password', pdfPassword);
      }

      const apiUrl = getApiUrl();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      const response = await fetch(`${apiUrl}/api/scan-invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (response.status === 402) {
          toast.error("Insufficient Credits. Please recharge your wallet.", { duration: 5000 });
        }
        throw new Error(errData?.detail || `Scan failed with status: ${response.status}`);
      }

      const result = await response.json();
      const updatedItem: FileState = {
        ...item,
        extractedData: result.data,
        isScanning: false,
        clientId,
        error: null,
      };
      setFileStates(prev => prev.map(f =>
        f.id === item.id ? updatedItem : f
      ));

      refreshCredits();

      // Pass file state directly — never look it up from a stale React closure
      await autoSaveInvoiceRef.current(item.id, updatedItem, result.data, clientId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred.';
      const message = errMsg.includes('Failed to fetch')
        ? 'Could not reach scan server. Check your connection and try again.'
        : errMsg;
      setFileStates(prev => prev.map(f =>
        f.id === item.id ? { ...f, error: message, isScanning: false } : f
      ));
    }
  }, [pdfPassword, refreshCredits, setFileStates]);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: { file: File }[]) => {
    if (!activeClientId) {
      toast.error("Please select a client first.");
      return;
    }

    const allDropped = [...acceptedFiles, ...fileRejections.map(r => r.file)];
    const zipFiles = allDropped.filter(f => f && f.name && f.name.toLowerCase().endsWith('.zip'));

    if (zipFiles.length > 0) {
      handleZipUpload(zipFiles[0]!);
      return;
    }

    if (fileRejections && fileRejections.length > 0) {
      toast.error("Invalid or unsupported file type.");
      if (acceptedFiles.length === 0) return;
    }

    const newFiles = acceptedFiles.map(file => {
      let previewUrl = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      return {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl,
        isScanning: true,
        extractedData: null,
        error: null,
        savedToCloud: false,
        clientId: activeClientId,
      };
    });
    setFileStates(prev => [...prev, ...newFiles]);

    void (async () => {
      for (const fs of newFiles) {
        await scanFile(fs);
      }
    })();
  }, [activeClientId, handleZipUpload, setFileStates, scanFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: uploadMode === 'single' ? {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf']
    } : {
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip']
    },
    maxFiles: 50,
  });

  const removeFile = (id: string) => {
    setFileStates(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFileStates([]);
  };

  const updateExtractedData = useCallback((id: string, data: InvoiceData) => {
    setFileStates(prev => prev.map(f => f.id === id ? { ...f, extractedData: data, savedToCloud: false } : f));
  }, [setFileStates]);

  const autoSaveInvoice = useCallback(async (fileId: string, fs: FileState, data: InvoiceData, clientId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in again to save invoices.');
        return;
      }

      if (!clientId) {
        toast.error('No client linked to this scan. Please re-upload with a client selected.');
        return;
      }

      await saveSingleInvoiceToDb(fileId, fs, data as unknown as Record<string, unknown>, session.user.id, clientId);
      setFileStates(prev => prev.map(f => f.id === fileId ? { ...f, savedToCloud: true, clientId } : f));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice saved');
    } catch (err: unknown) {
      console.error("Auto-save failed:", err);
      const e = err as { message?: string; details?: string; hint?: string };
      const msg = e?.message || e?.details || e?.hint || 'Unknown error';
      if (msg.includes('Unauthorized') || msg.includes('access')) {
        toast.error('Save failed: you may not have access to this client.');
      } else {
        toast.error(`Auto-save failed: ${msg}`, { duration: 6000 });
      }
    }
  }, [queryClient, setFileStates]);

  useEffect(() => {
    autoSaveInvoiceRef.current = autoSaveInvoice;
  }, [autoSaveInvoice]);

  const handleScanAll = async () => {
    const toScan = fileStates.filter(f => !f.extractedData && !f.isScanning && !f.error);
    if (toScan.length === 0) return;

    setFileStates(prev => prev.map(f =>
      toScan.some(ts => ts.id === f.id) ? { ...f, isScanning: true, error: null } : f
    ));

    const CHUNK_SIZE = 5;
    for (let i = 0; i < toScan.length; i += CHUNK_SIZE) {
      const chunk = toScan.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(scanFile));
    }
  };

  const retryScan = async (id: string) => {
    const item = fileStates.find(f => f.id === id);
    if (!item) return;

    setFileStates(prev => prev.map(f =>
      f.id === id ? { ...f, isScanning: true, error: null } : f
    ));

    await scanFile(item);
  };

  const handleSaveToCloud = async () => {
    const toSave = fileStates.filter(fs => fs.extractedData && !fs.savedToCloud);
    if (toSave.length === 0) return;

    setIsSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found. Please log in.");
      const userId = session.user.id;

      let saved = 0;
      for (const fs of toSave) {
        try {
          const clientId = fs.clientId ?? activeClientIdRef.current;
          if (!clientId) {
            toast.error(`No client selected for ${fs.file.name}`);
            continue;
          }
          await saveSingleInvoiceToDb(fs.id, fs, fs.extractedData as unknown as Record<string, unknown>, userId, clientId);
          setFileStates(prev => prev.map(f => f.id === fs.id ? { ...f, savedToCloud: true, clientId } : f));
          saved += 1;
        } catch (err: unknown) {
          console.error("Failed to save manually:", err);
          const e = err as { message?: string; details?: string };
          const msg = e?.message || e?.details || 'Unknown error';
          toast.error(`Failed to save ${fs.file.name}: ${msg}`, { duration: 6000 });
        }
      }

      if (saved > 0) {
        toast.success(`Saved ${saved} invoice${saved > 1 ? 's' : ''}.`);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save to cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCustomExportConfirm = async (columns: string[], includeItems: boolean, remember: boolean) => {
    setShowExportPicker(false);

    if (remember) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from('profiles').update({
          export_columns: columns,
          export_include_items: includeItems
        }).eq('id', session.user.id);
        setExportPrefs({ columns, includeItems });
      }
    }

    setIsExporting(true);
    try {
      const invoices = fileStates
        .filter(fs => fs.extractedData)
        .map(fs => ({ ...fs.extractedData, id: fs.id })) as (InvoiceData & { id: string })[];

      const allLineItems: (LineItem & { invoice_id: string })[] = [];
      invoices.forEach(inv => {
        if (inv.Line_Items && Array.isArray(inv.Line_Items)) {
          inv.Line_Items.forEach(li => {
            allLineItems.push({ ...li, invoice_id: inv.id });
          });
        }
      });

      const { exportToRawExcel } = await import('../../lib/exportService');
      exportToRawExcel(invoices, allLineItems, columns, includeItems);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate Custom Excel Report');
    } finally {
      setIsExporting(false);
    }
  };

  const successfullyExtractedCount = fileStates.filter(f => f.extractedData).length;
  const unsavedCount = fileStates.filter(f => f.extractedData && !f.savedToCloud).length;

  return {
    fileStates,
    visibleColumns,
    activeClientId,
    isExporting,
    isSaving,
    pdfPassword,
    setPdfPassword,
    showExportPicker,
    setShowExportPicker,
    exportPrefs,
    showSettings,
    setShowSettings,
    uploadMode,
    setUploadMode,
    settingsRef,
    getRootProps,
    getInputProps,
    isDragActive,
    toggleColumn,
    removeFile,
    clearAll,
    updateExtractedData,
    handleScanAll,
    retryScan,
    handleSaveToCloud,
    handleCustomExportConfirm,
    successfullyExtractedCount,
    unsavedCount,
  };
}
