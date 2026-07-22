import * as XLSX from 'xlsx';
import { AVAILABLE_COLUMNS } from './constants';
import { getApiUrl } from './api';
import { supabase } from './supabase';

export const exportToExcelMultiSheet = (invoices: any[], allLineItems: any[]) => {
  const tallyData: any[] = [];

  invoices.forEach((inv) => {
    const items = allLineItems?.filter((li) => li.invoice_id === inv.id) || [];
    const invDate = inv.invoice_date ? inv.invoice_date.replace(/-/g, '') : '';
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
};

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

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
      invoices: filteredInvoices,
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

export const exportToRawExcel = (
  invoices: any[],
  allLineItems: any[],
  selectedColumns: string[],
  includeItems: boolean,
) => {
  const rawData: any[] = [];

  const colMap = AVAILABLE_COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = col.label;
      return acc;
    },
    {} as Record<string, string>,
  );

  invoices.forEach((inv) => {
    const items = allLineItems?.filter((li) => li.invoice_id === inv.id) || [];

    const baseRow: any = {};
    selectedColumns.forEach((colKey) => {
      const dbField = colKey.toLowerCase();
      let val = inv[dbField];
      if (val === undefined || val === null) {
        val = '';
      }
      baseRow[colMap[colKey] || colKey] = val;
    });

    if (includeItems && items.length > 0) {
      items.forEach((item) => {
        const row = { ...baseRow };
        row['Item Description'] = item.description || '';
        row['Item HSN/SAC'] = item.hsn_sac || '';
        row['Item Qty'] = item.quantity || 0;
        row['Item Price'] = item.unit_price || 0;
        row['Item Tax %'] = item.tax_rate || 0;
        row['Item Amount'] = item.amount || 0;
        rawData.push(row);
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

  const workbook = XLSX.utils.book_new();
  const rawSheet = XLSX.utils.json_to_sheet(rawData);
  XLSX.utils.book_append_sheet(workbook, rawSheet, 'Custom Report');
  XLSX.writeFile(workbook, 'Custom_Invoice_Export.xlsx');
};
