import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Cloud, AlertCircle, AlertTriangle, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isValidGSTIN } from '../../utils/gstin';
import type { FileState, InvoiceData, LineItem } from '../../lib/ScanContext';
import { flaggedFieldSet, type ReviewReason } from '../../lib/ocrHighlight';
import { OcrPreviewOverlay } from './OcrPreviewOverlay';

const InvoiceRow = React.memo(function InvoiceRow({ fs, visibleColumns, onUpdate }: { fs: FileState, visibleColumns: string[], onUpdate: (data: InvoiceData) => void }) {
  const [expanded, setExpanded] = useState(false);
  const data = fs.extractedData || {};
  const hasItems = data.Line_Items && data.Line_Items.length > 0;
  const reasons = useMemo(
    () => (data.Review_Reasons || []) as ReviewReason[],
    [data.Review_Reasons]
  );
  const flagged = useMemo(() => flaggedFieldSet(reasons), [reasons]);
  const [highlightField, setHighlightField] = useState<string | null>(
    () => (data.Review_Fields && data.Review_Fields[0]) || null
  );

  const fieldClass = (key: string) =>
    cn(
      'bg-transparent border-b px-0 py-1 text-sm text-text-primary outline-none w-full',
      flagged.has(key)
        ? 'border-amber-400/80 focus:border-amber-300'
        : 'border-border focus:border-accent'
    );

  const onFocusField = (key: string) => {
    if (flagged.has(key)) setHighlightField(key);
  };

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
              onFocus={() => onFocusField(col)}
              className={cn(
                "bg-transparent border-none focus:ring-1 focus:ring-accent rounded px-1 py-0.5 w-full min-w-[100px]",
                col.includes('Amount') || col === 'Round_Off' ? 'text-right font-mono' : '',
                flagged.has(col) && 'ring-1 ring-amber-400/60'
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
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold mb-1">
                    {data.Extraction_State === 'needs_retry' ? "Low Confidence Extraction" : "Moderate Confidence Extraction"}
                  </h4>
                  <p className="text-xs opacity-90 mb-2">
                    {data.Extraction_State === 'needs_retry'
                      ? "The AI had difficulty reading this invoice. Accuracy may be poor. Please carefully review all fields below or retry the scan with a clearer image."
                      : "Please manually review and validate the extracted fields before saving to ensure accuracy."}
                  </p>
                  {reasons.length > 0 && (
                    <ul className="text-xs space-y-1 mt-2 opacity-95">
                      {reasons.slice(0, 8).map((r, i) => (
                        <li key={`${r.code}-${r.field}-${i}`}>
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => r.field && setHighlightField(r.field)}
                          >
                            <span className="font-medium uppercase tracking-wide text-[10px] mr-1.5">
                              {r.code}
                            </span>
                            {r.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {(fs.previewUrl || (data.Ocr_Words && data.Ocr_Words.length > 0)) && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-accent uppercase mb-2">
                  Document preview
                  {highlightField ? ` — ${highlightField.replace(/_/g, ' ')}` : ''}
                </h4>
                <OcrPreviewOverlay
                  previewUrl={fs.previewUrl}
                  words={data.Ocr_Words}
                  highlightField={highlightField}
                  highlightValue={highlightField ? data[highlightField] : undefined}
                  onSelectField={setHighlightField}
                  reasons={reasons}
                  pageWidth={data.Scan_Meta?.ocr_page_width}
                  pageHeight={data.Scan_Meta?.ocr_page_height}
                />
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
                       <label className="text-[10px] text-text-secondary uppercase tracking-wider">
                         {f.l}
                         {flagged.has(f.k) && <span className="ml-1 text-amber-400">•</span>}
                       </label>
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
                     <input
                       type="text"
                       value={data[f.k] || ''}
                       onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })}
                       onFocus={() => onFocusField(f.k)}
                       className={fieldClass(f.k)}
                     />
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
                       <label className="text-[10px] text-text-secondary uppercase tracking-wider">
                         {f.l}
                         {flagged.has(f.k) && <span className="ml-1 text-amber-400">•</span>}
                       </label>
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
                     <input
                       type="text"
                       value={data[f.k] || ''}
                       onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })}
                       onFocus={() => onFocusField(f.k)}
                       className={fieldClass(f.k)}
                     />
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
                   {k:'Amount_In_Words', l:'Amount in Words'}, {k:'Received_Amount', l:'Received Amount'}, {k:'Balance_Amount', l:'Balance Amount'},
                   {k:'Invoice_Number', l:'Invoice Number'}, {k:'Total_Amount', l:'Total Amount'}, {k:'Taxable_Amount', l:'Taxable'}
                 ].map(f => (
                   <div key={f.k} className="flex flex-col">
                     <label className="text-[10px] text-text-secondary uppercase tracking-wider">
                       {f.l}
                       {flagged.has(f.k) && <span className="ml-1 text-amber-400">•</span>}
                     </label>
                     <input
                       type="text"
                       value={data[f.k] || ''}
                       onChange={(e) => onUpdate({ ...data, [f.k]: e.target.value })}
                       onFocus={() => onFocusField(f.k)}
                       className={fieldClass(f.k)}
                     />
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
                    {data.Line_Items?.map((item: LineItem, idx: number) => {
                      const updateLine = (field: keyof LineItem, raw: string) => {
                        const items = [...(data.Line_Items || [])];
                        const current = { ...(items[idx] || {}) };
                        const numericFields: (keyof LineItem)[] = [
                          'Quantity',
                          'Unit_Price',
                          'Tax_Rate',
                          'Amount',
                        ];
                        if (numericFields.includes(field)) {
                          const n = raw === '' ? undefined : Number(raw);
                          (current as Record<string, unknown>)[field] =
                            raw === '' || Number.isNaN(n as number) ? raw : n;
                        } else {
                          (current as Record<string, unknown>)[field] = raw;
                        }
                        items[idx] = current;
                        onUpdate({ ...data, Line_Items: items });
                      };
                      return (
                      <tr key={idx} className="hover:bg-bg-subtle">
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={item.Description ?? ''}
                            onChange={(e) => updateLine('Description', e.target.value)}
                            className="bg-transparent border-none w-full min-w-[150px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={item.HSN_SAC ?? ''}
                            onChange={(e) => updateLine('HSN_SAC', e.target.value)}
                            className="bg-transparent border-none w-full min-w-[80px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="text"
                            value={item.Quantity ?? ''}
                            onChange={(e) => updateLine('Quantity', e.target.value)}
                            className="bg-transparent border-none w-full text-right font-mono min-w-[60px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="text"
                            value={item.Unit_Price ?? ''}
                            onChange={(e) => updateLine('Unit_Price', e.target.value)}
                            className="bg-transparent border-none w-full text-right font-mono min-w-[80px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="text"
                            value={item.Tax_Rate ?? ''}
                            onChange={(e) => updateLine('Tax_Rate', e.target.value)}
                            className="bg-transparent border-none w-full text-right font-mono min-w-[60px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <input
                            type="text"
                            value={item.Amount ?? ''}
                            onChange={(e) => updateLine('Amount', e.target.value)}
                            className="bg-transparent border-none w-full text-right font-mono min-w-[80px] focus:ring-1 focus:ring-accent rounded px-1"
                          />
                        </td>
                      </tr>
                      );
                    })}
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

export { InvoiceRow };
