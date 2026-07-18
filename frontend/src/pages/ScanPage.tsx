import React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, FileText, Loader2, Sparkles, Download, Settings, X, File as FileIcon, ChevronDown, ChevronUp, Cloud, RefreshCw, AlertCircle, AlertTriangle, Table2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
// Session import removed

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useScanContext } from '../lib/ScanContext';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS } from '../lib/constants';
import type { FileState, InvoiceData, LineItem } from '../lib/ScanContext';
import { ExportFieldPicker } from '../components/ExportFieldPicker';
import { useClient } from '../lib/ClientContext';
import { isValidGSTIN } from '../utils/gstin';

const safeNum = (val: any) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
};

function formatDateToIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  const match1 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match1) {
    const [, d, m, y] = match1;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  const match2 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match2) {
    const [, y, m, d] = match2;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  return s; 
}

// Auth logic moved to App.tsx

const InvoiceRow = React.memo(function InvoiceRow({ fs, visibleColumns, onUpdate }: { fs: FileState, visibleColumns: string[], onUpdate: (data: InvoiceData) => void }) {
  const [expanded, setExpanded] = useState(false);
  const data = fs.extractedData || {};
  const hasItems = data.Line_Items && data.Line_Items.length > 0;

  return (
    <>
      <tr className="hover:bg-white/[0.02] transition-colors group border-b border-white/5">
        <td className="p-2 w-8">
           <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-white/10 rounded text-textMuted hover:text-white transition-colors">
             {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
           </button>
        </td>
        <td className="p-4 text-sm font-medium text-white/80 max-w-[150px] truncate" title={fs.file.name}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {fs.savedToCloud && <span title="Saved to Cloud"><Cloud className="w-3 h-3 text-secondary" /></span>}
              <span className="truncate">{fs.file.name}</span>
            </div>
            {data.Extraction_State && (
              <div>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                  data.Extraction_State === 'auto_accepted' ? "bg-green-500/20 text-green-400" :
                  data.Extraction_State === 'needs_review' ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"
                )}>
                  {data.Extraction_State === 'auto_accepted' ? 'Auto Accepted' : data.Extraction_State === 'needs_review' ? 'Needs Review' : 'Needs Retry'}
                </span>
              </div>
            )}
          </div>
        </td>
        {visibleColumns.map(col => (
          <td key={col} className="p-4 text-sm text-text-primary whitespace-nowrap">
            <input 
              type="text" 
              value={data[col] || ''} 
              onChange={(e) => onUpdate({ ...data, [col]: e.target.value })}
              className={cn(
                "bg-transparent border-none focus:ring-1 focus:ring-accent rounded px-1 py-0.5 w-full min-w-[100px]",
                col.includes('Amount') || col === 'Round_Off' ? 'text-right font-mono' : ''
              )} 
            />
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="bg-bg-sunken">
          <td colSpan={visibleColumns.length + 2} className="p-6 border-b border-border">
            {data.Extraction_State !== 'auto_accepted' && data.Extraction_State && (
              <div className={cn(
                "mb-6 p-4 rounded-lg flex items-start gap-3 border",
                data.Extraction_State === 'needs_retry' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
              )}>
                {data.Extraction_State === 'needs_retry' ? (
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-sm font-semibold mb-1">
                    {data.Extraction_State === 'needs_retry' ? "Low Confidence Extraction" : "Moderate Confidence Extraction"}
                  </h4>
                  <p className="text-xs opacity-90">
                    {data.Extraction_State === 'needs_retry' 
                      ? "The AI had difficulty reading this invoice. Accuracy may be poor. Please carefully review all fields below or retry the scan with a clearer image." 
                      : "Please manually review and validate the extracted fields before saving to ensure accuracy."}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-6">
               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-accent uppercase flex items-center gap-2">Supplier Info</h4>
                 {[
                   {k:'Supplier_Name', l:'Name'}, {k:'Supplier_Address', l:'Address'}, {k:'Supplier_Phone', l:'Phone'},
                   {k:'Supplier_Email', l:'Email'}, {k:'Supplier_GSTIN', l:'GSTIN'}, {k:'Supplier_PAN', l:'PAN'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <div className="flex items-center justify-between">
                       <label className="text-[10px] text-text-secondary uppercase tracking-wider">{f.l}</label>
                       {(f.k === 'Supplier_GSTIN' || f.k === 'Buyer_GSTIN') && data[f.k] && (
                         <div className="flex items-center gap-2">
                           {!isValidGSTIN(data[f.k]) ? (
                             <span className="text-[9px] text-red-500 font-medium">Invalid Format</span>
                           ) : (
                             <span className="text-[9px] text-green-500 font-medium">Valid Format</span>
                           )}
                           <a 
                             href="https://services.gst.gov.in/services/searchtp" 
                             target="_blank" 
                             rel="noreferrer"
                             onClick={() => navigator.clipboard.writeText(data[f.k])}
                             title="Copy GSTIN and verify on Govt Portal"
                             className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded hover:bg-accent hover:text-white transition-colors cursor-pointer"
                           >
                             Verify KYC
                           </a>
                         </div>
                       )}
                     </div>
                     <input type="text" value={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-border focus:border-accent px-0 py-1 text-sm text-text-primary outline-none w-full" />
                   </div>
                 ))}
               </div>
               
               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-accent uppercase flex items-center gap-2">Buyer Info</h4>
                 {[
                   {k:'Buyer_Name', l:'Name'}, {k:'Buyer_Address', l:'Address'}, {k:'Buyer_PIN', l:'PIN'},
                   {k:'Buyer_GSTIN', l:'GSTIN'}, {k:'Buyer_PAN', l:'PAN'}, {k:'Place_Of_Supply', l:'Place of Supply'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <div className="flex items-center justify-between">
                       <label className="text-[10px] text-text-secondary uppercase tracking-wider">{f.l}</label>
                       {(f.k === 'Supplier_GSTIN' || f.k === 'Buyer_GSTIN') && data[f.k] && (
                         <div className="flex items-center gap-2">
                           {!isValidGSTIN(data[f.k]) ? (
                             <span className="text-[9px] text-red-500 font-medium">Invalid Format</span>
                           ) : (
                             <span className="text-[9px] text-green-500 font-medium">Valid Format</span>
                           )}
                           <a 
                             href="https://services.gst.gov.in/services/searchtp" 
                             target="_blank" 
                             rel="noreferrer"
                             onClick={() => navigator.clipboard.writeText(data[f.k])}
                             title="Copy GSTIN and verify on Govt Portal"
                             className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded hover:bg-accent hover:text-white transition-colors cursor-pointer"
                           >
                             Verify KYC
                           </a>
                         </div>
                       )}
                     </div>
                     <input type="text" value={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-border focus:border-accent px-0 py-1 text-sm text-text-primary outline-none w-full" />
                   </div>
                 ))}
               </div>

               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-accent uppercase flex items-center gap-2">Bank Details</h4>
                 {[
                   {k:'Account_Holder', l:'Account Holder'}, {k:'Account_Number', l:'Account Number'}, {k:'Bank_Name', l:'Bank Name'},
                   {k:'Branch_Name', l:'Branch Name'}, {k:'IFSC_Code', l:'IFSC Code'}, {k:'UPI_ID', l:'UPI ID'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-text-secondary uppercase tracking-wider">{f.l}</label>
                     <input type="text" value={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-border focus:border-accent px-0 py-1 text-sm text-text-primary outline-none w-full" />
                   </div>
                 ))}
               </div>

               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-accent uppercase flex items-center gap-2">Other Details</h4>
                 {[
                   {k:'Invoice_Date', l:'Invoice Date'}, {k:'Due_Date', l:'Due Date'}, {k:'PO_Number', l:'PO Number'},
                   {k:'Amount_In_Words', l:'Amount in Words'}, {k:'Received_Amount', l:'Received Amount'}, {k:'Balance_Amount', l:'Balance Amount'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-text-secondary uppercase tracking-wider">{f.l}</label>
                     <input type="text" value={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-border focus:border-accent px-0 py-1 text-sm text-text-primary outline-none w-full" />
                   </div>
                 ))}
               </div>
            </div>

            {hasItems && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Line Items
                </h4>
                <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-text-secondary border-b border-border">
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium">HSN/SAC</th>
                      <th className="pb-2 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Rate</th>
                      <th className="pb-2 font-medium text-right">Tax %</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.Line_Items?.map((item: LineItem, idx: number) => (
                      <tr key={idx} className="hover:bg-bg-subtle">
                        <td className="py-2 pr-2"><input type="text" defaultValue={item.Description || ''} className="bg-transparent border-none w-full min-w-[150px]" /></td>
                        <td className="py-2 px-2"><input type="text" defaultValue={item.HSN_SAC || ''} className="bg-transparent border-none w-full min-w-[80px]" /></td>
                        <td className="py-2 px-2 text-right"><input type="text" defaultValue={item.Quantity || ''} className="bg-transparent border-none w-full text-right font-mono min-w-[60px]" /></td>
                        <td className="py-2 px-2 text-right"><input type="text" defaultValue={item.Unit_Price || ''} className="bg-transparent border-none w-full text-right font-mono min-w-[80px]" /></td>
                        <td className="py-2 px-2 text-right"><input type="text" defaultValue={item.Tax_Rate || ''} className="bg-transparent border-none w-full text-right font-mono min-w-[60px]" /></td>
                        <td className="py-2 pl-2 text-right"><input type="text" defaultValue={item.Amount || ''} className="bg-transparent border-none w-full text-right font-mono min-w-[80px]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
});

/**
 * The ScanPage is the core operational hub of KhataLens.
 * 
 * Responsibilities:
 * 1. Handles both Single-File Drag-and-Drop and Bulk ZIP Batch uploads.
 * 2. Pre-validates PDFs using pdf.js to count pages before uploading to the backend,
 *    providing the user with a preview of how many credits will be consumed.
 * 3. Manages a complex state machine for each file (Queued -> Uploading -> Extracting -> Success/Failed).
 * 4. Renders the 'Verification Grid' where users can edit AI-extracted data before saving to Supabase.
 */
export default function ScanPage() {
  const { fileStates, setFileStates, visibleColumns, setVisibleColumns } = useScanContext();
  const { activeClientId, refreshCredits } = useClient();

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch export preferences on mount
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
          return [...prev, ...newFiles as any];
        }
        return prev;
      });
    }
  }, [activeClientId, setFileStates]);

  useEffect(() => {
    // Setup realtime listener for batch updates
    if (!activeClientId) return;
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `client_id=eq.${activeClientId}` },
        (payload) => {
          const updated = payload.new;
          if (updated.processing_status === 'completed' || updated.processing_status === 'failed') {
            // Update UI state
            setFileStates(prev => prev.map(fs => {
              if (fs.id === updated.id) {
                if (updated.processing_status === 'failed') {
                  return { ...fs, isScanning: false, error: updated.error_message || 'Batch processing failed' };
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
                      // mapped fields
                    }
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

  const handleZipUpload = async (file: File) => {
    if (!activeClientId) {
      toast.error("Please select a client first.");
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', activeClientId);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
      
      if (!response.ok) throw new Error("Failed to upload ZIP");
      const resData = await response.json();
      
      toast.success(`Queued ${resData.queued_ids?.length || 0} invoices for background processing!`, { id: "zip-upload" });
      fetchPendingBatchInvoices();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload ZIP", { id: "zip-upload" });
    }
  };

  const compressImage = (file: File, maxWidth: number, maxHeight: number): Promise<File> => {
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
  };

  const scanFile = async (item: FileState) => {
    try {
      const processedFile = await compressImage(item.file, 1536, 1536);
      const formData = new FormData();
      formData.append('file', processedFile);
      if (pdfPassword) {
        formData.append('password', pdfPassword);
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
      setFileStates(prev => prev.map(f => 
        f.id === item.id ? { ...f, extractedData: result.data, isScanning: false } : f
      ));
      
      refreshCredits();
      
      await autoSaveInvoice(item.id, result.data);
    } catch (err: any) {
      setFileStates(prev => prev.map(f => 
        f.id === item.id ? { ...f, error: err.message || 'An error occurred.', isScanning: false } : f
      ));
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    const allDropped = [...acceptedFiles, ...fileRejections.map(r => r.file)];
    const zipFiles = allDropped.filter(f => f && f.name && f.name.toLowerCase().endsWith('.zip'));
    
    if (zipFiles.length > 0) {
      handleZipUpload(zipFiles[0]);
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
      };
    });
    setFileStates(prev => [...prev, ...newFiles]);
    
    // Auto-trigger extraction
    newFiles.forEach(fs => {
      scanFile(fs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleZipUpload, setFileStates, scanFile]);

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

  const updateExtractedData = (id: string, data: InvoiceData) => {
    setFileStates(prev => prev.map(f => f.id === id ? { ...f, extractedData: data, savedToCloud: false } : f));
  };

  const saveSingleInvoiceToDb = async (_fileId: string, fs: FileState, data: any, userId: string) => {
    const invoiceData = {
      user_id: userId,
      client_id: activeClientId,
      file_name: fs.file.name || 'Unknown',
      supplier_name: data.Supplier_Name,
      supplier_address: data.Supplier_Address,
      supplier_phone: data.Supplier_Phone,
      supplier_email: data.Supplier_Email,
      supplier_gstin: data.Supplier_GSTIN,
      supplier_pan: data.Supplier_PAN,
      buyer_name: data.Buyer_Name,
      buyer_address: data.Buyer_Address,
      buyer_pin: data.Buyer_PIN,
      buyer_gstin: data.Buyer_GSTIN,
      buyer_pan: data.Buyer_PAN,
      place_of_supply: data.Place_Of_Supply,
      invoice_date: formatDateToIso(data.Invoice_Date),
      due_date: formatDateToIso(data.Due_Date),
      invoice_number: data.Invoice_Number,
      po_number: data.PO_Number,
      e_way_bill_number: data.E_Way_Bill_Number,
      vehicle_number: data.Vehicle_Number,
      taxable_amount: safeNum(data.Taxable_Amount),
      cgst_amount: safeNum(data.CGST_Amount),
      sgst_amount: safeNum(data.SGST_Amount),
      igst_amount: safeNum(data.IGST_Amount),
      round_off: safeNum(data.Round_Off),
      total_amount: safeNum(data.Total_Amount),
      gst_amount: safeNum(data.GST_Amount),
      confidence_score: safeNum(data.Confidence_Score),
      amount_in_words: data.Amount_In_Words,
      received_amount: safeNum(data.Received_Amount),
      balance_amount: safeNum(data.Balance_Amount),
      previous_balance: safeNum(data.Previous_Balance),
      current_balance: safeNum(data.Current_Balance),
      account_holder: data.Account_Holder,
      account_number: data.Account_Number,
      bank_name: data.Bank_Name,
      branch_name: data.Branch_Name,
      ifsc_code: data.IFSC_Code,
      upi_id: data.UPI_ID,
      expense_category: data.Expense_Category,
      invoice_type: data.Invoice_Type,
      reverse_charge_applicable: data.Reverse_Charge_Applicable,
      cess_amount: safeNum(data.Cess_Amount),
      irn: data.IRN,
      original_invoice_number: data.Original_Invoice_Number,
      original_invoice_date: formatDateToIso(data.Original_Invoice_Date)
    };

    const lineItems = (data.Line_Items || []).map((item: any) => ({
      description: item.Description,
      hsn_sac: item.HSN_SAC,
      quantity: safeNum(item.Quantity),
      unit_price: safeNum(item.Unit_Price),
      tax_rate: safeNum(item.Tax_Rate),
      amount: safeNum(item.Amount)
    }));

    const { data: rpcData, error: rpcError } = await supabase.rpc('save_invoice_atomic', {
      invoice_data: invoiceData,
      line_items: lineItems
    });

    if (rpcError) throw rpcError;
    return rpcData;
  };

  const autoSaveInvoice = async (fileId: string, data: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const fs = fileStates.find(f => f.id === fileId);
      if (!fs) return;
      
      await saveSingleInvoiceToDb(fileId, fs, data, session.user.id);
      setFileStates(prev => prev.map(f => f.id === fileId ? { ...f, savedToCloud: true } : f));
    } catch (err: any) {
      console.error("Auto-save failed:", err);
      toast.error(`Auto-save failed: ${err.message || 'Unknown error'}`);
    }
  };

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

      for (const fs of toSave) {
        try {
          await saveSingleInvoiceToDb(fs.id, fs, fs.extractedData, userId);
          setFileStates(prev => prev.map(f => f.id === fs.id ? { ...f, savedToCloud: true } : f));
        } catch (err: any) {
          console.error("Failed to save manually:", err);
          toast.error(`Failed to save ${fs.file.name}`);
        }
      }
      
      toast.success("Successfully saved pending invoices.");
    } catch (err: any) {
      toast.error(err.message || 'Failed to save to cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcelTally = async () => {
    setIsExporting(true);
    try {
      const invoices = fileStates
        .filter(fs => fs.extractedData)
        .map(fs => ({ ...fs.extractedData, id: fs.id })) as (InvoiceData & { id: string })[];

      if (invoices.length === 0) {
        alert("No extracted data available to export.");
        setIsExporting(false);
        return;
      }

      // Group all line items
      const allLineItems: (LineItem & { invoice_id: string })[] = [];
      invoices.forEach(inv => {
        if (inv.Line_Items && Array.isArray(inv.Line_Items)) {
          inv.Line_Items.forEach(li => {
            allLineItems.push({ ...li, invoice_id: inv.id });
          });
        }
      });

      const { exportToExcelMultiSheet } = await import('../lib/exportService');
      exportToExcelMultiSheet(invoices, allLineItems);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Tally Excel');
    } finally {
      setIsExporting(false);
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

      const { exportToRawExcel } = await import('../lib/exportService');
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

  return (
    <div className="h-full bg-bg-base relative font-sans text-text-primary selection:bg-accent-subtle">
      {/* Main Content */}
      <main className="p-4 lg:p-6 max-w-[1600px] mx-auto h-full flex flex-col">
        
        <div className="card flex-1 flex flex-col lg:flex-row p-0 overflow-hidden shadow-lg border-border">
          
          {/* Left Column: Upload & List */}
          <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-bg-surface">
            <div className="p-6 border-b border-border bg-bg-sunken/50">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">Digitize.</h1>
              <p className="text-text-secondary text-sm">Drop messy invoices, get perfect data.</p>
            </div>

            <div className="p-6 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex-1 min-h-[200px]"
              >
                <div
                  {...getRootProps()}
                  className={cn(
                    "w-full h-full min-h-[250px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group text-center shadow-none",
                    isDragActive ? "border-accent bg-accent-subtle" : "border-border hover:border-accent hover:bg-bg-sunken bg-bg-base"
                  )}
                >
              <div className="flex bg-bg-sunken p-1 rounded-lg mb-4 w-full max-w-xs mx-auto">
                <button 
                  onClick={(e) => { e.stopPropagation(); setUploadMode('single'); }}
                  className={cn("flex-1 text-xs py-1.5 rounded-md font-medium transition-colors", uploadMode === 'single' ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}
                >
                  Images / PDFs
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setUploadMode('zip'); }}
                  className={cn("flex-1 text-xs py-1.5 rounded-md font-medium transition-colors", uploadMode === 'zip' ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}
                >
                  ZIP Batch
                </button>
              </div>
              <input {...getInputProps()} />
              <div className="w-14 h-14 rounded-full bg-bg-sunken flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud className={cn("w-6 h-6", isDragActive ? "text-accent" : "text-text-secondary")} />
              </div>
              <p className="font-medium text-text-primary mb-1">
                {uploadMode === 'single' ? "Drag & drop invoices" : "Drag & drop a ZIP folder"}
              </p>
              <p className="text-xs text-text-secondary">
                {uploadMode === 'single' ? "JPG, PNG, PDF (Max 50 files)" : "ZIP (Unlimited invoices processed in background)"}
              </p>
            </div>
          </motion.div>

          <div className="mb-6">
            <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">PDF Password (Optional)</label>
            <input
              type="password"
              placeholder="If the PDF is password-protected"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              className="w-full bg-bg-sunken border border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-md px-3 py-2 text-sm text-text-primary transition-all"
            />
          </div>

          {fileStates.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-xs text-textMuted uppercase tracking-wider">Queue ({fileStates.length})</h3>
                <div className="flex gap-2">
                  <button onClick={clearAll} className="text-xs text-textMuted hover:text-white px-2 py-1 rounded transition-colors">Clear</button>
                  <button 
                    onClick={handleScanAll} 
                    className="text-xs bg-primary text-white hover:bg-primary/90 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" /> Extract All
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {fileStates.map((fs) => (
                  <div key={fs.id} className="card p-3 flex gap-3 items-center group shadow-none">
                    {fs.previewUrl ? (
                      <img src={fs.previewUrl} alt="preview" className="w-10 h-10 rounded object-cover border border-border" />
                    ) : (
                      <div className="w-10 h-10 bg-bg-sunken rounded border border-border flex items-center justify-center">
                        <FileIcon className="w-4 h-4 text-text-secondary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-text-primary">{fs.file.name}</p>
                      
                      {fs.isScanning ? (
                        <p className="text-accent text-[10px] mt-0.5 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" /> Scanning...
                        </p>
                      ) : fs.error ? (
                        <p className="text-error text-[10px] mt-0.5 truncate" title={fs.error}>{fs.error}</p>
                      ) : fs.extractedData ? (
                        <p className="text-success text-[10px] mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </p>
                      ) : (
                        <p className="text-text-secondary text-[10px] mt-0.5">Ready</p>
                      )}
                    </div>
                    <div className="flex items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all gap-1">
                      {fs.error && (
                        <button 
                          onClick={() => retryScan(fs.id)}
                          className="p-1 hover:bg-bg-sunken rounded text-text-secondary hover:text-text-primary"
                          title="Retry"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                      <button 
                        onClick={() => removeFile(fs.id)}
                        className="p-1 hover:bg-bg-sunken rounded text-text-secondary hover:text-text-primary"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Right Column: Verification Grid */}
          <div className="w-full lg:w-[60%] xl:w-[65%] min-h-[500px] lg:h-full flex flex-col bg-bg-base border-t lg:border-t-0 border-border">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-bg-surface min-h-[84px] shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-text-secondary" />
                <h2 className="text-sm font-semibold text-text-primary">Verification Grid</h2>
                {successfullyExtractedCount > 0 && (
                  <span className="badge bg-accent-subtle text-accent border border-accent/20 ml-2">
                    {successfullyExtractedCount} extracted
                  </span>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="relative" ref={settingsRef}>
                    <button 
                      onClick={() => setShowSettings(!showSettings)} 
                      className={cn("btn-ghost px-2", showSettings && "bg-bg-sunken")}
                      title="Column Settings"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 mt-2 w-64 card p-3 z-50 shadow-lg"
                        >
                          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Visible Columns</h4>
                          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {AVAILABLE_COLUMNS.map(col => (
                              <label key={col.key} className="flex items-center gap-3 px-2 py-1.5 hover:bg-bg-sunken rounded cursor-pointer group">
                                <div className="relative flex items-center justify-center w-4 h-4">
                                  <input 
                                    type="checkbox" 
                                    checked={visibleColumns.includes(col.key)} 
                                    onChange={() => toggleColumn(col.key)}
                                    className="peer appearance-none w-4 h-4 border border-border rounded bg-transparent checked:bg-accent checked:border-accent transition-all cursor-pointer"
                                  />
                                  <CheckCircle2 className="w-3 h-3 text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                </div>
                                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{col.label}</span>
                              </label>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button 
                    onClick={handleSaveToCloud}
                    disabled={unsavedCount === 0 || isSaving || !activeClientId}
                    className="btn-ghost flex-1 sm:flex-none justify-center"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                    {!activeClientId ? 'Select Client' : `Save ${unsavedCount > 0 ? `(${unsavedCount})` : ''}`}
                  </button>
                <button 
                  onClick={() => setShowExportPicker(true)}
                  disabled={successfullyExtractedCount === 0 || isExporting}
                  className="btn-ghost flex-1 sm:flex-none justify-center"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />}
                  Custom Report
                </button>
                <button 
                  onClick={handleExportExcelTally}
                  disabled={successfullyExtractedCount === 0 || isExporting}
                  className="btn-ghost flex-1 sm:flex-none justify-center"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Tally Excel</span>
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-0 relative overflow-hidden flex flex-col bg-bg-base">
              {!fileStates.some(f => f.extractedData) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary p-8 text-center bg-bg-surface m-4 rounded-xl border border-dashed border-border">
                  <div className="w-20 h-20 rounded-full bg-bg-sunken flex items-center justify-center mb-6">
                    <FileText className="w-10 h-10 text-text-disabled" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2">No Invoices Extracted</h3>
                  <p className="text-sm text-text-secondary max-w-md">
                    Drag and drop your invoices in the panel on the left to begin the automated data extraction process.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-bg-sunken sticky top-0 z-10 shadow-sm border-b border-border">
                      <tr>
                        <th className="p-4 w-8"></th>
                        <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">Filename</th>
                        {visibleColumns.map(col => {
                           const colDef = AVAILABLE_COLUMNS.find(c => c.key === col);
                           const isAmount = col.includes('Amount') || col === 'Round_Off';
                           return (
                             <th key={col} className={cn("p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap", isAmount ? "text-right" : "")}>
                               {colDef?.label}
                             </th>
                           );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {fileStates.filter(fs => fs.extractedData).map((fs) => (
                        <InvoiceRow key={fs.id} fs={fs} visibleColumns={visibleColumns} onUpdate={(data) => updateExtractedData(fs.id, data)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      <ExportFieldPicker 
        isOpen={showExportPicker}
        onClose={() => setShowExportPicker(false)}
        onConfirm={handleCustomExportConfirm}
        initialColumns={exportPrefs.columns}
        initialIncludeItems={exportPrefs.includeItems}
      />
    </div>
  );
}
