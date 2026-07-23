/**
 * Purchase-Register import: types + snake_case→Title_Case conversion.
 *
 * The backend /api/import/purchase-register/preview returns rows whose
 * `invoice_data` is snake_case (the exact save_invoice_atomic contract). The
 * existing Verification Grid speaks Title_Case `InvoiceData`, so we convert here
 * and stamp `Source='import'` + the review reasons/fields the grid already
 * highlights. No new grid code — imported rows behave like scanned drafts.
 */
import type { FileState, InvoiceData, LineItem } from '../../lib/ScanContext';

export type ImportReason = {
  code: string;
  field?: string | null;
  message: string;
  severity?: string;
};

export type ImportPreviewRow = {
  row_index: number;
  invoice_data: Record<string, unknown>;
  line_items: Array<Record<string, unknown>>;
  status: 'ready' | 'needs_review' | 'duplicate' | 'error';
  extraction_state: string;
  confidence_score: number;
  reasons: ImportReason[];
  dedupe_key: string;
};

export type ImportPreviewResponse = {
  detected_doc_type: string;
  doc_type_confidence: number;
  mapping: Record<string, string>;
  unmapped_required: string[];
  headers: string[];
  row_count: number;
  preview_rows: ImportPreviewRow[];
  truncated: boolean;
  summary: {
    total: number;
    ready: number;
    needs_review: number;
    duplicates: number;
    errors: number;
  };
};

/** Import target fields, in display order, with human labels for the mapping UI. */
export const IMPORT_FIELDS: Array<{ field: string; label: string; required: boolean }> = [
  { field: 'supplier_gstin', label: 'Supplier GSTIN', required: true },
  { field: 'invoice_number', label: 'Invoice Number', required: true },
  { field: 'invoice_date', label: 'Invoice Date', required: true },
  { field: 'supplier_name', label: 'Supplier Name', required: false },
  { field: 'taxable_amount', label: 'Taxable Amount', required: false },
  { field: 'cgst_amount', label: 'CGST', required: false },
  { field: 'sgst_amount', label: 'SGST', required: false },
  { field: 'igst_amount', label: 'IGST', required: false },
  { field: 'cess_amount', label: 'Cess', required: false },
  { field: 'total_amount', label: 'Total / Invoice Value', required: false },
  { field: 'place_of_supply', label: 'Place of Supply', required: false },
  { field: 'hsn_sac', label: 'HSN / SAC', required: false },
  { field: 'tax_rate', label: 'Tax Rate', required: false },
  { field: 'narration', label: 'Narration / Description', required: false },
];

const SNAKE_TO_TITLE: Record<string, string> = {
  supplier_name: 'Supplier_Name',
  supplier_gstin: 'Supplier_GSTIN',
  place_of_supply: 'Place_Of_Supply',
  invoice_number: 'Invoice_Number',
  invoice_date: 'Invoice_Date',
  taxable_amount: 'Taxable_Amount',
  cgst_amount: 'CGST_Amount',
  sgst_amount: 'SGST_Amount',
  igst_amount: 'IGST_Amount',
  cess_amount: 'Cess_Amount',
  total_amount: 'Total_Amount',
  gst_amount: 'GST_Amount',
};

function snakeFieldToTitle(field?: string | null): string | undefined {
  if (!field) return undefined;
  return SNAKE_TO_TITLE[field];
}

/** Convert one preview row's snake_case invoice_data into Title_Case InvoiceData. */
export function importRowToInvoiceData(row: ImportPreviewRow): InvoiceData {
  const src = row.invoice_data || {};
  const data: InvoiceData = {
    Source: 'import',
    Extraction_State: row.extraction_state,
    Confidence_Score: row.confidence_score,
  };

  for (const [snake, title] of Object.entries(SNAKE_TO_TITLE)) {
    if (src[snake] !== undefined && src[snake] !== null) {
      (data as Record<string, unknown>)[title] = src[snake];
    }
  }

  const items = (row.line_items || []) as Array<Record<string, unknown>>;
  if (items.length > 0) {
    data.Line_Items = items.map((li): LineItem => ({
      Description: (li.description as string) ?? undefined,
      HSN_SAC: (li.hsn_sac as string) ?? undefined,
      Quantity: (li.quantity as number) ?? undefined,
      Unit_Price: (li.unit_price as number) ?? undefined,
      Tax_Rate: (li.tax_rate as number) ?? undefined,
      Amount: (li.amount as number) ?? undefined,
    }));
  }

  if (row.reasons && row.reasons.length > 0) {
    data.Review_Reasons = row.reasons.map((r) => ({
      code: r.code,
      field: snakeFieldToTitle(r.field) ?? r.field ?? null,
      message: r.message,
      severity: r.severity,
    }));
    data.Review_Fields = Array.from(
      new Set(
        row.reasons
          .map((r) => snakeFieldToTitle(r.field))
          .filter((f): f is string => Boolean(f)),
      ),
    );
  }

  return data;
}

/** Build a synthetic FileState so an imported row flows through the existing grid. */
export function importRowToFileState(
  row: ImportPreviewRow,
  clientId: string | null,
): FileState {
  const invoiceNumber = (row.invoice_data?.invoice_number as string) || 'import-row';
  const genId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return {
    id: genId,
    file: new File([], invoiceNumber),
    previewUrl: null,
    isScanning: false,
    extractedData: importRowToInvoiceData(row),
    error: null,
    savedToCloud: false,
    clientId,
  };
}
