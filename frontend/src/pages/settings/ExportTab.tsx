import { Loader2, Save, Table2, CheckSquare, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS, EXPORT_CATEGORIES } from '../../lib/constants';
import { tabSlide } from './types';

type ExportTabProps = {
  exportColumns: Set<string>;
  setExportColumns: (cols: Set<string>) => void;
  exportIncludeItems: boolean;
  setExportIncludeItems: (v: boolean) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function ExportTab({
  exportColumns,
  setExportColumns,
  exportIncludeItems,
  setExportIncludeItems,
  saving,
  onSubmit,
}: ExportTabProps) {
  return (
    <motion.form
      key="export"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      onSubmit={onSubmit}
      className="card p-6 space-y-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center">
          <Table2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-text-primary">Custom Export Defaults</h2>
          <p className="text-sm text-text-secondary font-light">Select the fields to include when you generate a Custom Report.</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={() => setExportColumns(new Set(AVAILABLE_COLUMNS.map(c => c.key)))} className="text-xs text-accent hover:underline font-medium">Select All</button>
          <span className="text-border">|</span>
          <button type="button" onClick={() => setExportColumns(new Set())} className="text-xs text-text-secondary hover:text-text-primary">Clear All</button>
          <span className="text-border">|</span>
          <button type="button" onClick={() => setExportColumns(new Set(DEFAULT_COLUMNS))} className="text-xs text-text-secondary hover:text-text-primary">Reset Defaults</button>
        </div>

        {Object.entries(EXPORT_CATEGORIES).map(([catName, keys]) => (
          <div key={catName}>
            <h4 className="text-sm font-bold text-text-primary mb-3 border-b border-border/50 pb-1">{catName}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {keys.map(key => {
                const colDef = AVAILABLE_COLUMNS.find(c => c.key === key);
                if (!colDef) return null;
                const isSelected = exportColumns.has(key);
                return (
                  <label
                    key={key}
                    onClick={() => {
                      const next = new Set(exportColumns);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      setExportColumns(next);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent/5 border-accent/30 text-accent' : 'bg-bg-sunken border-border text-text-secondary hover:bg-bg-surface'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-50" />}
                    <span className="text-sm truncate" title={colDef.label}>{colDef.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-border flex flex-col gap-2">
          <h4 className="text-sm font-bold text-text-primary">Line Items</h4>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              className="rounded border-border text-accent focus:ring-accent w-4 h-4"
              checked={exportIncludeItems}
              onChange={(e) => setExportIncludeItems(e.target.checked)}
            />
            <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
              Include Line Items <span className="text-xs text-text-secondary font-normal">(creates 1 row per item)</span>
            </span>
          </label>
        </div>
      </div>

      <div className="pt-6 flex justify-end border-t border-border">
        <button type="submit" disabled={saving || exportColumns.size === 0} className="btn-primary" id="settings-save-export-btn">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Export Preferences
        </button>
      </div>
    </motion.form>
  );
}
