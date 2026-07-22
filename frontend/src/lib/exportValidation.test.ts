import { describe, expect, it } from 'vitest';
import {
  formatExportGateMessage,
  validateInvoiceForExport,
  validateInvoicesForExport,
} from './exportValidation';
import { buildRawExportRows } from './exportService';

const OK_GSTIN = '27AAPFU0939F1ZV';

describe('exportValidation', () => {
  it('flags missing mandatory fields', () => {
    const issues = validateInvoiceForExport({ id: '1', Supplier_Name: 'Acme' });
    expect(issues.some((i) => i.message.includes('GSTIN'))).toBe(true);
    expect(issues.some((i) => i.message.includes('Invoice Number'))).toBe(true);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('accepts a complete balanced invoice', () => {
    const issues = validateInvoiceForExport({
      id: '1',
      Supplier_GSTIN: OK_GSTIN,
      Invoice_Number: 'INV-1',
      Invoice_Date: '2024-01-01',
      Taxable_Amount: 1000,
      CGST_Amount: 90,
      SGST_Amount: 90,
      Total_Amount: 1180,
    });
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('detects total mismatch', () => {
    const issues = validateInvoiceForExport({
      id: '1',
      supplier_gstin: OK_GSTIN,
      invoice_number: 'INV-1',
      invoice_date: '2024-01-01',
      taxable_amount: 1000,
      cgst_amount: 90,
      sgst_amount: 90,
      total_amount: 1500,
    });
    expect(issues.some((i) => i.message.includes('Totals mismatch'))).toBe(true);
  });

  it('blocks batch when any error', () => {
    const gate = validateInvoicesForExport([
      {
        id: '1',
        Supplier_GSTIN: OK_GSTIN,
        Invoice_Number: 'A',
        Invoice_Date: '2024-01-01',
        Total_Amount: 100,
      },
      { id: '2', Supplier_Name: 'Bad' },
    ]);
    expect(gate.ok).toBe(false);
    expect(formatExportGateMessage(gate.errors)).toContain('Export blocked');
  });
});

describe('buildRawExportRows', () => {
  it('reads PascalCase scan fields and snake_case DB fields', () => {
    const rows = buildRawExportRows(
      [
        {
          id: 'a',
          Supplier_Name: 'FromScan',
          Invoice_Number: 'S-1',
        },
        {
          id: 'b',
          supplier_name: 'FromDb',
          invoice_number: 'D-1',
        },
      ],
      [
        {
          invoice_id: 'a',
          Description: 'Widget',
          Amount: 10,
        },
        {
          invoice_id: 'b',
          description: 'Service',
          amount: 20,
        },
      ],
      ['Supplier_Name', 'Invoice_Number'],
      true,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!['Supplier Name']).toBe('FromScan');
    expect(rows[0]!['Item Description']).toBe('Widget');
    expect(rows[1]!['Supplier Name']).toBe('FromDb');
    expect(rows[1]!['Item Description']).toBe('Service');
  });
});
