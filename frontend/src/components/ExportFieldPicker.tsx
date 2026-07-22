import { useState, useEffect } from 'react';
import { CheckSquare, Square, Table2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS, EXPORT_CATEGORIES } from '../lib/constants';

interface ExportFieldPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    selectedColumns: string[],
    includeItems: boolean,
    remember: boolean,
    format: 'xlsx' | 'csv' | 'json',
  ) => void;
  initialColumns?: string[];
  initialIncludeItems?: boolean;
}

export function ExportFieldPicker({ isOpen, onClose, onConfirm, initialColumns, initialIncludeItems = true }: ExportFieldPickerProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(initialColumns || DEFAULT_COLUMNS));
  const [includeItems, setIncludeItems] = useState(initialIncludeItems);
  const [remember, setRemember] = useState(true);
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');

  useEffect(() => {
    if (isOpen) {
      if (initialColumns && initialColumns.length > 0) {
        setSelectedColumns(new Set(initialColumns));
      } else {
        setSelectedColumns(new Set(DEFAULT_COLUMNS));
      }
      setIncludeItems(initialIncludeItems);
      setFormat('xlsx');
    }
  }, [isOpen, initialColumns, initialIncludeItems]);

  const handleToggleColumn = (key: string) => {
    const next = new Set(selectedColumns);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedColumns(next);
  };

  const handleSelectAll = () => {
    setSelectedColumns(new Set(AVAILABLE_COLUMNS.map(c => c.key)));
  };

  const handleClearAll = () => {
    setSelectedColumns(new Set());
  };

  const handleReset = () => {
    setSelectedColumns(new Set(DEFAULT_COLUMNS));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Table2 className="w-5 h-5 text-accent" />
          <span>Custom Export</span>
        </div>
      }
      size="3xl"
    >
      <div className="flex flex-col h-[70vh]">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div>
            <p className="text-sm text-text-secondary">Select fields and format for your report.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSelectAll} className="text-xs text-accent hover:underline font-medium">Select All</button>
            <span className="text-border">|</span>
            <button onClick={handleClearAll} className="text-xs text-text-secondary hover:text-text-primary">Clear All</button>
            <span className="text-border">|</span>
            <button onClick={handleReset} className="text-xs text-text-secondary hover:text-text-primary">Reset Defaults</button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            { id: 'xlsx', label: 'Excel (.xlsx)' },
            { id: 'csv', label: 'CSV' },
            { id: 'json', label: 'JSON' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFormat(opt.id)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                format === opt.id
                  ? 'bg-accent/10 border-accent/40 text-accent'
                  : 'border-border text-text-secondary hover:bg-bg-sunken'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
          {Object.entries(EXPORT_CATEGORIES).map(([catName, keys]) => (
            <div key={catName}>
              <h4 className="text-sm font-bold text-text-primary mb-3 border-b border-border/50 pb-1">{catName}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {keys.map(key => {
                  const colDef = AVAILABLE_COLUMNS.find(c => c.key === key);
                  if (!colDef) return null;
                  const isSelected = selectedColumns.has(key);
                  return (
                    <label 
                      key={key} 
                      onClick={() => handleToggleColumn(key)}
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
        </div>

        <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row gap-4 items-center justify-between bg-bg-surface sticky bottom-0">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                className="rounded border-border text-accent focus:ring-accent w-4 h-4" 
                checked={includeItems}
                onChange={(e) => setIncludeItems(e.target.checked)}
              />
              <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                Include Line Items <span className="text-xs text-text-secondary font-normal">(creates 1 row per item)</span>
              </span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded border-border text-accent focus:ring-accent w-4 h-4" 
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="text-sm text-text-secondary">Save these preferences for next time</span>
            </label>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button onClick={onClose} className="btn-secondary flex-1 sm:flex-none">Cancel</button>
            <button 
              onClick={() => onConfirm(Array.from(selectedColumns), includeItems, remember, format)} 
              disabled={selectedColumns.size === 0}
              className="btn-primary flex-1 sm:flex-none"
            >
              Export {selectedColumns.size} Fields ({format.toUpperCase()})
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
