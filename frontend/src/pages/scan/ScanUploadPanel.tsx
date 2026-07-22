import { motion } from 'framer-motion';
import {
  UploadCloud, CheckCircle2, Loader2, Sparkles, X, File as FileIcon, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FileState } from '../../lib/ScanContext';
import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';

type ScanUploadPanelProps = {
  getRootProps: () => DropzoneRootProps;
  getInputProps: () => DropzoneInputProps;
  isDragActive: boolean;
  uploadMode: 'single' | 'zip';
  setUploadMode: (mode: 'single' | 'zip') => void;
  pdfPassword: string;
  setPdfPassword: (value: string) => void;
  fileStates: FileState[];
  clearAll: () => void;
  handleScanAll: () => void;
  retryScan: (id: string) => void;
  removeFile: (id: string) => void;
  cancelScan: (id: string) => void;
};

export function ScanUploadPanel({
  getRootProps,
  getInputProps,
  isDragActive,
  uploadMode,
  setUploadMode,
  pdfPassword,
  setPdfPassword,
  fileStates,
  clearAll,
  handleScanAll,
  retryScan,
  removeFile,
  cancelScan,
}: ScanUploadPanelProps) {
  return (
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
              "w-full h-full min-h-[250px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group text-center shadow-none hover-lift",
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
              {uploadMode === 'single'
                ? "JPG, PNG, PDF (Max 50 files)"
                : "ZIP of JPG/PNG/PDF — max ~50 MB uncompressed (processed in background)"}
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
                  className="text-xs bg-primary text-white hover:bg-primary/90 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors hover-lift"
                >
                  <Sparkles className="w-3 h-3" /> Extract All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {fileStates.map((fs, idx) => (
                <div key={fs.id} className="card p-3 flex gap-3 items-center group shadow-none hover-lift animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
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
                    {fs.isScanning && (
                      <button
                        onClick={() => cancelScan(fs.id)}
                        className="p-1 hover:bg-bg-sunken rounded text-text-secondary hover:text-error"
                        title="Cancel scan"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
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
  );
}
