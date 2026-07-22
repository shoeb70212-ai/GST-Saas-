/**
 * Pre-export validation for GST invoices (Phase 4).
 * Blocks export when mandatory fields or money math fail.
 */
import { isValidGSTIN } from '../utils/gstin';

const MATH_TOLERANCE = 1.0;

export type ExportIssue = {
  invoiceId: string;
  label: string;
  severity: 'error' | 'warning';
  message: string;
};

function pick(inv: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (inv[k] !== undefined && inv[k] !== null && inv[k] !== '') return inv[k];
    const lower = k.toLowerCase();
    if (inv[lower] !== undefined && inv[lower] !== null && inv[lower] !== '') {
      return inv[lower];
    }
  }
  return undefined;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function invoiceLabel(inv: Record<string, unknown>): string {
  const numKey = pick(inv, 'Invoice_Number', 'invoice_number');
  const name = pick(inv, 'Supplier_Name', 'supplier_name', 'file_name');
  return String(numKey || name || inv.id || 'invoice');
}

export function validateInvoiceForExport(
  inv: Record<string, unknown>,
): ExportIssue[] {
  const id = String(inv.id || '');
  const label = invoiceLabel(inv);
  const issues: ExportIssue[] = [];

  const gstin = pick(inv, 'Supplier_GSTIN', 'supplier_gstin');
  if (!gstin) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'error',
      message: 'Missing Supplier GSTIN',
    });
  } else if (!isValidGSTIN(String(gstin))) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'error',
      message: 'Invalid Supplier GSTIN format',
    });
  }

  if (!pick(inv, 'Invoice_Number', 'invoice_number')) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'error',
      message: 'Missing Invoice Number',
    });
  }

  if (!pick(inv, 'Invoice_Date', 'invoice_date')) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'error',
      message: 'Missing Invoice Date',
    });
  }

  const total = num(pick(inv, 'Total_Amount', 'total_amount'));
  if (!total) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'error',
      message: 'Missing or zero Total Amount',
    });
  }

  const taxable = num(pick(inv, 'Taxable_Amount', 'taxable_amount'));
  const cgst = num(pick(inv, 'CGST_Amount', 'cgst_amount'));
  const sgst = num(pick(inv, 'SGST_Amount', 'sgst_amount'));
  const igst = num(pick(inv, 'IGST_Amount', 'igst_amount'));
  const cess = num(pick(inv, 'Cess_Amount', 'cess_amount'));
  const roundOff = num(pick(inv, 'Round_Off', 'round_off'));
  const taxSum = cgst + sgst + igst + cess;

  if (taxable > 0 && taxSum > 0 && total > 0) {
    const computed = Math.round((taxable + taxSum + roundOff) * 100) / 100;
    if (Math.abs(computed - total) > MATH_TOLERANCE) {
      issues.push({
        invoiceId: id,
        label,
        severity: 'error',
        message: `Totals mismatch (taxable+tax=${computed} vs total=${total})`,
      });
    }
  }

  if (cgst > 0 && igst > 0) {
    issues.push({
      invoiceId: id,
      label,
      severity: 'warning',
      message: 'Both CGST and IGST present — check place of supply',
    });
  }

  return issues;
}

export function validateInvoicesForExport(
  invoices: Record<string, unknown>[],
): { ok: boolean; errors: ExportIssue[]; warnings: ExportIssue[] } {
  const all = invoices.flatMap((inv) => validateInvoiceForExport(inv));
  const errors = all.filter((i) => i.severity === 'error');
  const warnings = all.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings };
}

/** Short toast-friendly summary (max 3 errors). */
export function formatExportGateMessage(errors: ExportIssue[]): string {
  const sample = errors.slice(0, 3).map((e) => `${e.label}: ${e.message}`);
  const more = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';
  return `Export blocked — fix ${errors.length} issue(s). ${sample.join('; ')}${more}`;
}
