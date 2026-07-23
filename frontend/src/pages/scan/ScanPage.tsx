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
import { ExportFieldPicker } from '../../components/ExportFieldPicker';
import { useScanWorkflow } from './useScanWorkflow';
import { ScanUploadPanel } from './ScanUploadPanel';
import { ScanVerificationGrid } from './ScanVerificationGrid';

export default function ScanPage() {
  const scan = useScanWorkflow();

  return (
    <div className="h-full bg-bg-base relative font-sans text-text-primary selection:bg-accent-subtle">
      <main className="p-4 lg:p-6 max-w-[1600px] mx-auto h-full flex flex-col">
        <div className="card flex-1 flex flex-col lg:flex-row p-0 overflow-hidden shadow-lg border-border animate-fade-in">
          <ScanUploadPanel
            getRootProps={scan.getRootProps}
            getInputProps={scan.getInputProps}
            isDragActive={scan.isDragActive}
            uploadMode={scan.uploadMode}
            setUploadMode={scan.setUploadMode}
            pdfPassword={scan.pdfPassword}
            setPdfPassword={scan.setPdfPassword}
            fileStates={scan.fileStates}
            clearAll={scan.clearAll}
            handleScanAll={scan.handleScanAll}
            retryScan={scan.retryScan}
            removeFile={scan.removeFile}
            cancelScan={scan.cancelScan}
            activeClientId={scan.activeClientId}
            addImportedRows={scan.addImportedRows}
          />
          <ScanVerificationGrid
            fileStates={scan.fileStates}
            visibleColumns={scan.visibleColumns}
            activeClientId={scan.activeClientId}
            successfullyExtractedCount={scan.successfullyExtractedCount}
            unsavedCount={scan.unsavedCount}
            isSaving={scan.isSaving}
            isExporting={scan.isExporting}
            showSettings={scan.showSettings}
            setShowSettings={scan.setShowSettings}
            settingsRef={scan.settingsRef}
            toggleColumn={scan.toggleColumn}
            handleSaveToCloud={scan.handleSaveToCloud}
            setShowExportPicker={scan.setShowExportPicker}
            updateExtractedData={scan.updateExtractedData}
          />
        </div>
      </main>

      <ExportFieldPicker
        isOpen={scan.showExportPicker}
        onClose={() => scan.setShowExportPicker(false)}
        onConfirm={scan.handleCustomExportConfirm}
        initialColumns={scan.exportPrefs.columns}
        initialIncludeItems={scan.exportPrefs.includeItems}
      />
    </div>
  );
}
