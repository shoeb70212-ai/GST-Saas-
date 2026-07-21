import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, Settings, Cloud, CheckCircle2, Table2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AVAILABLE_COLUMNS } from '../../lib/constants';
import type { FileState, InvoiceData } from '../../lib/ScanContext';
import { InvoiceRow } from './InvoiceRow';
import type { RefObject } from 'react';

type ScanVerificationGridProps = {
  fileStates: FileState[];
  visibleColumns: string[];
  activeClientId: string | null;
  successfullyExtractedCount: number;
  unsavedCount: number;
  isSaving: boolean;
  isExporting: boolean;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  settingsRef: RefObject<HTMLDivElement | null>;
  toggleColumn: (key: string) => void;
  handleSaveToCloud: () => void;
  setShowExportPicker: (show: boolean) => void;
  updateExtractedData: (id: string, data: InvoiceData) => void;
};

export function ScanVerificationGrid({
  fileStates,
  visibleColumns,
  activeClientId,
  successfullyExtractedCount,
  unsavedCount,
  isSaving,
  isExporting,
  showSettings,
  setShowSettings,
  settingsRef,
  toggleColumn,
  handleSaveToCloud,
  setShowExportPicker,
  updateExtractedData,
}: ScanVerificationGridProps) {
  return (
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
  );
}
