import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, FileText, Loader2, Sparkles, Download, Settings, ChevronRight, X, File as FileIcon, ChevronDown, ChevronUp, Cloud, LogOut, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
// Session import removed

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useScanContext, AVAILABLE_COLUMNS } from '../lib/ScanContext';
import type { FileState, InvoiceData, LineItem } from '../lib/ScanContext';

// Auth logic moved to App.tsx

function InvoiceRow({ fs, visibleColumns, onUpdate }: { fs: FileState, visibleColumns: string[], onUpdate: (data: InvoiceData) => void }) {
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
            {data.Confidence_Score !== undefined && (
              <div>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                  data.Confidence_Score >= 90 ? "bg-green-500/20 text-green-400" :
                  data.Confidence_Score >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"
                )}>
                  {data.Confidence_Score}% Match
                </span>
              </div>
            )}
          </div>
        </td>
        {visibleColumns.map(col => (
          <td key={col} className="p-4 text-sm text-textMain whitespace-nowrap">
            <input 
              type="text" 
              defaultValue={data[col] || ''} 
              onChange={(e) => onUpdate({ ...data, [col]: e.target.value })}
              className={cn(
                "bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 py-0.5 w-full min-w-[100px]",
                col.includes('Amount') || col === 'Round_Off' ? 'text-right font-mono' : ''
              )} 
            />
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="bg-surface/20">
          <td colSpan={visibleColumns.length + 2} className="p-6 border-b border-white/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-6">
               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-primary uppercase flex items-center gap-2">Supplier Info</h4>
                 {[
                   {k:'Supplier_Name', l:'Name'}, {k:'Supplier_Address', l:'Address'}, {k:'Supplier_Phone', l:'Phone'},
                   {k:'Supplier_Email', l:'Email'}, {k:'Supplier_GSTIN', l:'GSTIN'}, {k:'Supplier_PAN', l:'PAN'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-textMuted uppercase tracking-wider">{f.l}</label>
                     <input type="text" defaultValue={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-white/10 focus:border-primary px-0 py-1 text-sm text-white/90 outline-none w-full" />
                   </div>
                 ))}
               </div>
               
               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-primary uppercase flex items-center gap-2">Buyer Info</h4>
                 {[
                   {k:'Buyer_Name', l:'Name'}, {k:'Buyer_Address', l:'Address'}, {k:'Buyer_PIN', l:'PIN'},
                   {k:'Buyer_GSTIN', l:'GSTIN'}, {k:'Buyer_PAN', l:'PAN'}, {k:'Place_Of_Supply', l:'Place of Supply'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-textMuted uppercase tracking-wider">{f.l}</label>
                     <input type="text" defaultValue={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-white/10 focus:border-primary px-0 py-1 text-sm text-white/90 outline-none w-full" />
                   </div>
                 ))}
               </div>

               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-primary uppercase flex items-center gap-2">Bank Details</h4>
                 {[
                   {k:'Account_Holder', l:'Account Holder'}, {k:'Account_Number', l:'Account Number'}, {k:'Bank_Name', l:'Bank Name'},
                   {k:'Branch_Name', l:'Branch Name'}, {k:'IFSC_Code', l:'IFSC Code'}, {k:'UPI_ID', l:'UPI ID'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-textMuted uppercase tracking-wider">{f.l}</label>
                     <input type="text" defaultValue={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-white/10 focus:border-primary px-0 py-1 text-sm text-white/90 outline-none w-full" />
                   </div>
                 ))}
               </div>

               <div className="space-y-3">
                 <h4 className="text-xs font-semibold text-primary uppercase flex items-center gap-2">Other Details</h4>
                 {[
                   {k:'Invoice_Date', l:'Invoice Date'}, {k:'Due_Date', l:'Due Date'}, {k:'PO_Number', l:'PO Number'},
                   {k:'Amount_In_Words', l:'Amount in Words'}, {k:'Received_Amount', l:'Received Amount'}, {k:'Balance_Amount', l:'Balance Amount'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-textMuted uppercase tracking-wider">{f.l}</label>
                     <input type="text" defaultValue={data[f.k] || ''} onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })} className="bg-transparent border-b border-white/10 focus:border-primary px-0 py-1 text-sm text-white/90 outline-none w-full" />
                   </div>
                 ))}
               </div>
            </div>

            {hasItems && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-textMuted uppercase mb-2 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Line Items
                </h4>
                <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-textMuted border-b border-white/10">
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium">HSN/SAC</th>
                      <th className="pb-2 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Rate</th>
                      <th className="pb-2 font-medium text-right">Tax %</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.Line_Items?.map((item: LineItem, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5">
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
}

export default function ScanPage() {
  // Session is now handled globally in App.tsx
  // We can just rely on Supabase client when we need the session
  const { fileStates, setFileStates, visibleColumns, setVisibleColumns } = useScanContext();
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // local storage column init is now handled in ScanContext

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      localStorage.setItem('payforce_columns', JSON.stringify(next));
      return next;
    });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => {
      let previewUrl = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      return {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl,
        isScanning: false,
        extractedData: null,
        error: null,
        savedToCloud: false,
      };
    });
    setFileStates(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 10,
  });

  const removeFile = (id: string) => {
    setFileStates(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFileStates([]);
  };

  const updateExtractedData = (id: string, data: InvoiceData) => {
    // If they edit it, it's no longer safely saved (conceptually), but we'll leave it simple for now.
    setFileStates(prev => prev.map(f => f.id === id ? { ...f, extractedData: data, savedToCloud: false } : f));
  };

  const scanFile = async (item: FileState) => {
    const formData = new FormData();
    formData.append('file', item.file);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/scan-invoice`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Scan failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      setFileStates(prev => prev.map(f => 
        f.id === item.id ? { ...f, extractedData: result.data, isScanning: false } : f
      ));
    } catch (err: any) {
      setFileStates(prev => prev.map(f => 
        f.id === item.id ? { ...f, error: err.message || 'An error occurred.', isScanning: false } : f
      ));
    }
  };

  const handleScanAll = async () => {
    const toScan = fileStates.filter(f => !f.extractedData && !f.isScanning && !f.error);
    if (toScan.length === 0) return;

    setFileStates(prev => prev.map(f => 
      toScan.some(ts => ts.id === f.id) ? { ...f, isScanning: true, error: null } : f
    ));

    await Promise.all(toScan.map(scanFile));
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
        const data = fs.extractedData!;
        
        // 1. Insert Invoice
        const { data: invoiceRes, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: userId,
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
            invoice_date: data.Invoice_Date,
            due_date: data.Due_Date,
            invoice_number: data.Invoice_Number,
            po_number: data.PO_Number,
            e_way_bill_number: data.E_Way_Bill_Number,
            vehicle_number: data.Vehicle_Number,
            taxable_amount: data.Taxable_Amount,
            cgst_amount: data.CGST_Amount,
            sgst_amount: data.SGST_Amount,
            igst_amount: data.IGST_Amount,
            round_off: data.Round_Off,
            total_amount: data.Total_Amount,
            gst_amount: data.GST_Amount,
            confidence_score: data.Confidence_Score,
            amount_in_words: data.Amount_In_Words,
            received_amount: data.Received_Amount,
            balance_amount: data.Balance_Amount,
            previous_balance: data.Previous_Balance,
            current_balance: data.Current_Balance,
            account_holder: data.Account_Holder,
            account_number: data.Account_Number,
            bank_name: data.Bank_Name,
            branch_name: data.Branch_Name,
            ifsc_code: data.IFSC_Code,
            upi_id: data.UPI_ID,
          })
          .select('id')
          .single();
          
        if (invoiceError) throw invoiceError;
        
        // 2. Insert Line Items if any
        if (data.Line_Items && data.Line_Items.length > 0) {
          const itemsToInsert = data.Line_Items.map(item => ({
            invoice_id: invoiceRes.id,
            description: item.Description,
            hsn_sac: item.HSN_SAC,
            quantity: item.Quantity,
            unit_price: item.Unit_Price,
            tax_rate: item.Tax_Rate,
            amount: item.Amount
          }));
          
          const { error: itemsError } = await supabase
            .from('invoice_line_items')
            .insert(itemsToInsert);
            
          if (itemsError) throw itemsError;
        }

        // Mark as saved
        setFileStates(prev => prev.map(f => f.id === fs.id ? { ...f, savedToCloud: true } : f));
      }
      
      alert('Successfully saved to cloud database!');
    } catch (err: any) {
      console.error(err);
      alert('Error saving to cloud: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const dataToExport: any[] = [];
      
      fileStates.filter(fs => fs.extractedData).forEach(fs => {
        const baseData: any = { 'Filename': fs.file.name };
        
        // Include only visible columns
        visibleColumns.forEach(key => {
          const colDef = AVAILABLE_COLUMNS.find(c => c.key === key);
          if (colDef && fs.extractedData) {
            baseData[colDef.label] = fs.extractedData[key] || '';
          }
        });
        
        const items = fs.extractedData?.Line_Items || [];
        if (items.length > 0) {
          // Flatten line items: Repeat base data for each item
          items.forEach((item: LineItem) => {
            dataToExport.push({
              ...baseData,
              'Item Description': item.Description || '',
              'Item HSN/SAC': item.HSN_SAC || '',
              'Item Qty': item.Quantity || '',
              'Item Rate': item.Unit_Price || '',
              'Item Tax %': item.Tax_Rate || '',
              'Item Amount': item.Amount || '',
            });
          });
        } else {
          // No items, just export header row
          dataToExport.push(baseData);
        }
      });
        
      if (dataToExport.length === 0) {
        alert("No extracted data available to export.");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
      XLSX.writeFile(workbook, "Extracted_Invoices.xlsx");
    } finally {
      setIsExporting(false);
    }
  };

  // Auth is globally enforced in App.tsx

  const successfullyExtractedCount = fileStates.filter(f => f.extractedData).length;
  const unsavedCount = fileStates.filter(f => f.extractedData && !f.savedToCloud).length;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden font-sans text-textMain selection:bg-primary/30 pb-20">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-[150px] pointer-events-none" />
      
      {/* Navbar */}
      <nav className="glass fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            PayForce AI
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="glass-card px-4 py-1.5 flex items-center gap-2 text-sm font-medium border-primary/20">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span>9 Credits</span>
          </div>
          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={cn("p-2 hover:bg-white/5 rounded-lg transition-colors", showSettings && "bg-white/10")}
              title="Column Settings"
            >
              <Settings className="w-5 h-5 text-textMuted" />
            </button>
            
            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-64 glass-card border border-white/10 rounded-xl p-3 z-50 shadow-2xl"
                >
                  <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Visible Columns</h4>
                  <div className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    {AVAILABLE_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer group">
                        <div className="relative flex items-center justify-center w-4 h-4">
                          <input 
                            type="checkbox" 
                            checked={visibleColumns.includes(col.key)} 
                            onChange={() => toggleColumn(col.key)}
                            className="peer appearance-none w-4 h-4 border border-white/20 rounded bg-transparent checked:bg-primary checked:border-primary transition-all cursor-pointer"
                          />
                          <CheckCircle2 className="w-3 h-3 text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none" />
                        </div>
                        <span className="text-sm text-white/80 group-hover:text-white transition-colors">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="p-2 hover:bg-red-500/10 hover:text-red-400 text-textMuted rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-28 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Column: Upload & List */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Digitize.</h1>
            <p className="text-textMuted text-sm">Drop messy invoices, get perfect data.</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              {...getRootProps()}
              className={cn(
                "glass-card border-2 border-dashed p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group text-center",
                isDragActive ? "border-primary bg-primary/5" : "border-white/10 hover:border-primary/50 hover:bg-white/5"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud className={cn("w-6 h-6", isDragActive ? "text-primary" : "text-textMuted")} />
              </div>
              <p className="font-medium mb-1">Drag & drop invoices</p>
              <p className="text-xs text-textMuted">JPG, PNG, PDF (Max 10)</p>
            </div>
          </motion.div>

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
                  <div key={fs.id} className="glass-card p-3 flex gap-3 items-center group">
                    {fs.previewUrl ? (
                      <img src={fs.previewUrl} alt="preview" className="w-10 h-10 rounded object-cover border border-white/10" />
                    ) : (
                      <div className="w-10 h-10 bg-surface rounded border border-white/10 flex items-center justify-center">
                        <FileIcon className="w-4 h-4 text-textMuted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-white/90">{fs.file.name}</p>
                      
                      {fs.isScanning ? (
                        <p className="text-primary text-[10px] mt-0.5 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" /> Scanning...
                        </p>
                      ) : fs.error ? (
                        <p className="text-red-400 text-[10px] mt-0.5 truncate" title={fs.error}>{fs.error}</p>
                      ) : fs.extractedData ? (
                        <p className="text-secondary text-[10px] mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </p>
                      ) : (
                        <p className="text-textMuted text-[10px] mt-0.5">Ready</p>
                      )}
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all gap-1">
                      {fs.error && (
                        <button 
                          onClick={() => retryScan(fs.id)}
                          className="p-1 hover:bg-white/10 rounded text-textMuted hover:text-white"
                          title="Retry"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                      <button 
                        onClick={() => removeFile(fs.id)}
                        className="p-1 hover:bg-white/10 rounded text-textMuted hover:text-white"
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

        {/* Right Column: Verification Grid */}
        <div className="lg:col-span-8 xl:col-span-9 h-full">
          <div className="glass-card h-full min-h-[70vh] flex flex-col">
            <div className="p-4 border-b border-white/5 flex flex-wrap gap-4 items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-textMuted" />
                <h2 className="text-sm font-semibold">Verification Grid</h2>
                {successfullyExtractedCount > 0 && (
                  <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full ml-2">
                    {successfullyExtractedCount} extracted
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                  <button 
                    onClick={handleSaveToCloud}
                    disabled={unsavedCount === 0 || isSaving}
                    className="flex items-center gap-2 text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                    Save to Cloud {unsavedCount > 0 ? `(${unsavedCount})` : ''}
                  </button>
                <button 
                  onClick={handleExportExcel}
                  disabled={successfullyExtractedCount === 0 || isExporting}
                  className="flex items-center gap-2 text-xs font-medium bg-secondary/10 text-secondary hover:bg-secondary/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Export Excel
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-0 relative overflow-hidden flex flex-col">
              {!fileStates.some(f => f.extractedData) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-textMuted p-6 text-center">
                  <div className="w-16 h-16 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center mb-4">
                    <ChevronRight className="w-6 h-6 opacity-50" />
                  </div>
                  <p className="text-sm">Upload and extract invoices to verify data.</p>
                  <p className="text-xs mt-2 opacity-50 max-w-sm">Use the Settings icon in the top right to configure which columns are visible.</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface/30 sticky top-0 backdrop-blur-md z-10 shadow-sm">
                      <tr>
                        <th className="p-4 w-8 border-b border-white/5"></th>
                        <th className="p-4 text-xs font-semibold text-textMuted uppercase tracking-wider border-b border-white/5 whitespace-nowrap">Filename</th>
                        {visibleColumns.map(col => {
                           const colDef = AVAILABLE_COLUMNS.find(c => c.key === col);
                           const isAmount = col.includes('Amount') || col === 'Round_Off';
                           return (
                             <th key={col} className={cn("p-4 text-xs font-semibold text-textMuted uppercase tracking-wider border-b border-white/5 whitespace-nowrap", isAmount ? "text-right" : "")}>
                               {colDef?.label}
                             </th>
                           );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
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

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
