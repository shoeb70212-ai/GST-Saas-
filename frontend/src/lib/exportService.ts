/**
 * Invoice export builders + downloads (Phase 4).
 * Heavy Excel encoding runs in a Web Worker when available.
 */
import { AVAILABLE_COLUMNS } from './constants';
import { getApiUrl } from './api';
import { supabase } from './supabase';

export type ExportFormat = 'xlsx' | 'csv' | 'json';

export type LineItemRow = Record<string, unknown> & {
  invoice_id?: string;
  description?: string;
  Description?: string;
  hsn_sac?: string;
  HSN_SAC?: string;
  quantity?: number | string;
  Quantity?: number | string;
  unit_price?: number | string;
  Unit_Price?: number | string;
  tax_rate?: number | string;
  Tax_Rate?: number | string;
  amount?: number | string;
  Amount?: number | string;
};

function pickField(inv: Record<string, unknown>, colKey: string): unknown {
  if (inv[colKey] !== undefined && inv[colKey] !== null) return inv[colKey];
  const lower = colKey.toLowerCase();
  if (inv[lower] !== undefined && inv[lower] !== null) return inv[lower];
  return '';
}

function itemField(item: LineItemRow, ...keys: string[]): unknown {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== '') return item[k];
  }
  return '';
}

export function buildRawExportRows(
  invoices: Record<string, unknown>[],
  allLineItems: LineItemRow[],
  selectedColumns: string[],
  includeItems: boolean,
): Record<string, unknown>[] {
  const colMap = AVAILABLE_COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = col.label;
      return acc;
    },
    {} as Record<string, string>,
  );

  const rawData: Record<string, unknown>[] = [];

  invoices.forEach((inv) => {
    const id = String(inv.id || '');
    const items = (allLineItems || []).filter(
      (li) => String(li.invoice_id || '') === id,
    );

    const baseRow: Record<string, unknown> = {};
    selectedColumns.forEach((colKey) => {
      const val = pickField(inv, colKey);
      baseRow[colMap[colKey] || colKey] = val === undefined || val === null ? '' : val;
    });

    if (includeItems && items.length > 0) {
      items.forEach((item) => {
        rawData.push({
          ...baseRow,
          'Item Description': itemField(item, 'description', 'Description'),
          'Item HSN/SAC': itemField(item, 'hsn_sac', 'HSN_SAC'),
          'Item Qty': itemField(item, 'quantity', 'Quantity') || 0,
          'Item Price': itemField(item, 'unit_price', 'Unit_Price') || 0,
          'Item Tax %': itemField(item, 'tax_rate', 'Tax_Rate') || 0,
          'Item Amount': itemField(item, 'amount', 'Amount') || 0,
        });
      });
    } else {
      if (includeItems) {
        baseRow['Item Description'] = '';
        baseRow['Item HSN/SAC'] = '';
        baseRow['Item Qty'] = '';
        baseRow['Item Price'] = '';
        baseRow['Item Tax %'] = '';
        baseRow['Item Amount'] = '';
      }
      rawData.push(baseRow);
    }
  });

  return rawData;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function downloadTextFile(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

async function writeExcelInWorker(
  rows: Record<string, unknown>[],
  filename: string,
): Promise<boolean> {
  try {
    const worker = new Worker(
      new URL('./export.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        worker.terminate();
        resolve(false);
      }, 60_000);
      worker.onmessage = (ev: MessageEvent) => {
        window.clearTimeout(timer);
        const data = ev.data as {
          ok?: boolean;
          buffer?: ArrayBuffer;
          filename?: string;
        };
        worker.terminate();
        if (data?.ok && data.buffer) {
          downloadBlob(
            new Blob([data.buffer], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
            data.filename || filename,
          );
          resolve(true);
        } else {
          resolve(false);
        }
      };
      worker.onerror = () => {
        window.clearTimeout(timer);
        worker.terminate();
        resolve(false);
      };
      worker.postMessage({ type: 'excel', rows, filename, sheetName: 'Custom Report' });
    });
  } catch {
    return false;
  }
}

async function writeExcelMainThread(
  rows: Record<string, unknown>[],
  filename: string,
) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Custom Report');
  XLSX.writeFile(workbook, filename);
}

export async function exportCustomReport(
  invoices: Record<string, unknown>[],
  allLineItems: LineItemRow[],
  selectedColumns: string[],
  includeItems: boolean,
  format: ExportFormat = 'xlsx',
): Promise<void> {
  const rows = buildRawExportRows(invoices, allLineItems, selectedColumns, includeItems);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    downloadTextFile(
      JSON.stringify({ exported_at: stamp, count: rows.length, rows }, null, 2),
      `Custom_Invoice_Export_${stamp}.json`,
      'application/json',
    );
    return;
  }

  if (format === 'csv') {
    downloadTextFile(
      rowsToCsv(rows),
      `Custom_Invoice_Export_${stamp}.csv`,
      'text/csv;charset=utf-8',
    );
    return;
  }

  const filename = `Custom_Invoice_Export_${stamp}.xlsx`;
  const ok = await writeExcelInWorker(rows, filename);
  if (!ok) {
    await writeExcelMainThread(rows, filename);
  }
}

/** @deprecated Prefer exportCustomReport — kept for call sites */
export const exportToRawExcel = (
  invoices: any[],
  allLineItems: any[],
  selectedColumns: string[],
  includeItems: boolean,
) => {
  void exportCustomReport(
    invoices,
    allLineItems,
    selectedColumns,
    includeItems,
    'xlsx',
  );
};

// --- Tally / multi-sheet (unchanged behaviour, still main-thread) ---

export const exportToExcelMultiSheet = (invoices: any[], allLineItems: any[]) => {
  void (async () => {
    const XLSX = await import('xlsx');
    const tallyData: any[] = [];

    invoices.forEach((inv) => {
      const items = allLineItems?.filter((li: any) => li.invoice_id === inv.id) || [];
      const invDate = inv.invoice_date ? String(inv.invoice_date).replace(/-/g, '') : '';
      const invType = inv.invoice_type || 'Tax Invoice';
      let vchType = 'Purchase';
      if (invType === 'Credit Note') vchType = 'Credit Note';
      if (invType === 'Debit Note') vchType = 'Debit Note';

      const isCreditDebit = invType === 'Credit Note' || invType === 'Debit Note';
      const mult = isCreditDebit ? -1 : 1;
      const partyDrCr = mult > 0 ? 'Cr' : 'Dr';
      const expenseDrCr = mult > 0 ? 'Dr' : 'Cr';

      tallyData.push({
        'Voucher Date': invDate,
        'Voucher Type Name': vchType,
        'Voucher Number': inv.invoice_number || '',
        'Ledger Name': inv.supplier_name || 'Cash',
        'Ledger Amount': inv.total_amount || 0,
        'Ledger Amount Dr/Cr': partyDrCr,
      });

      if (items.length > 0) {
        items.forEach((item: any) => {
          tallyData.push({
            'Voucher Date': invDate,
            'Voucher Type Name': vchType,
            'Voucher Number': inv.invoice_number || '',
            'Ledger Name': inv.expense_category || 'Purchase A/c',
            'Ledger Amount': item.amount || 0,
            'Ledger Amount Dr/Cr': expenseDrCr,
          });
        });
      } else {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': inv.expense_category || 'Purchase A/c',
          'Ledger Amount': inv.taxable_amount || 0,
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      }

      if (invType !== 'Bill of Supply') {
        for (const [ledger, amount] of [
          ['CGST', inv.cgst_amount],
          ['SGST', inv.sgst_amount],
          ['IGST', inv.igst_amount],
          ['Cess', inv.cess_amount],
        ] as const) {
          if (amount) {
            tallyData.push({
              'Voucher Date': invDate,
              'Voucher Type Name': vchType,
              'Voucher Number': inv.invoice_number || '',
              'Ledger Name': ledger,
              'Ledger Amount': amount,
              'Ledger Amount Dr/Cr': expenseDrCr,
            });
          }
        }
      }
    });

    const workbook = XLSX.utils.book_new();
    const tallySheet = XLSX.utils.json_to_sheet(tallyData);
    XLSX.utils.book_append_sheet(workbook, tallySheet, 'Accounting Vouchers');
    XLSX.writeFile(workbook, 'Tally_Import_Template.xlsx');
  })();
};

/**
 * Authoritative Tally XML via backend engine (masters + balanced vouchers).
 */
export const exportToTallyXML = async (
  filteredInvoices: any[],
  allLineItems: any[],
): Promise<{ ok: boolean; report?: any }> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/export/tally/invoices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoices: filteredInvoices.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        created_at: inv.created_at,
        supplier_name: inv.supplier_name,
        supplier_gstin: inv.supplier_gstin,
        expense_category: inv.expense_category,
        total_amount: inv.total_amount,
        taxable_amount: inv.taxable_amount,
        cgst_amount: inv.cgst_amount,
        sgst_amount: inv.sgst_amount,
        igst_amount: inv.igst_amount,
        cess_amount: inv.cess_amount,
        round_off: inv.round_off,
        invoice_type: inv.invoice_type,
        original_invoice_number: inv.original_invoice_number,
        original_invoice_date: inv.original_invoice_date,
        place_of_supply: inv.place_of_supply,
        document_type: inv.document_type,
      })),
      line_items: (allLineItems || []).map((li: any) => ({
        invoice_id: li.invoice_id,
        description: li.description,
        hsn_sac: li.hsn_sac,
        quantity: li.quantity,
        unit_price: li.unit_price,
        amount: li.amount,
        tax_rate: li.tax_rate,
      })),
      default_voucher: 'Purchase',
      auto_balance: true,
      include_masters: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Tally export failed (${res.status})`);
  }

  const json = await res.json();
  if (json.xml) {
    downloadTextFile(json.xml, 'Tally_Vouchers.xml', 'application/xml');
  }
  if (json.excel_template) {
    downloadTextFile(json.excel_template, 'Tally_Import_Template.csv', 'text/csv');
  }
  return { ok: !!json.report?.ok, report: json.report };
};

export const exportTallyDocument = async (
  document: any,
  mappings: Record<string, string> = {},
  clientId?: string | null,
): Promise<any> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/tally-converter/export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document,
      mappings,
      auto_balance: true,
      include_masters: true,
      client_id: clientId || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Tally export failed (${res.status})`);
  }
  return res.json();
};

/** Paginated pull of all invoices matching current filters (export-all-matching). */
export async function fetchAllMatchingInvoices(opts: {
  clientId: string;
  searchTerm?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
}): Promise<Record<string, unknown>[]> {
  const pageSize = opts.pageSize ?? 500;
  const all: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('client_id', opts.clientId);

    if (opts.searchTerm) {
      const q = opts.searchTerm;
      query = query.or(
        `supplier_name.ilike.%${q}%,buyer_name.ilike.%${q}%,invoice_number.ilike.%${q}%`,
      );
    }

    const { data, error } = await query
      .order(opts.sortField || 'created_at', {
        ascending: (opts.sortDirection || 'desc') === 'asc',
      })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    // Safety cap ~50k rows
    if (all.length >= 50_000) break;
  }

  return all;
}
