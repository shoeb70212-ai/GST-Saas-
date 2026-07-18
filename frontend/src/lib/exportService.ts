import * as XLSX from 'xlsx';
import { AVAILABLE_COLUMNS } from './constants';

export const exportToExcelMultiSheet = (invoices: any[], allLineItems: any[]) => {
  const tallyData: any[] = [];
  
  invoices.forEach(inv => {
    const items = allLineItems?.filter(li => li.invoice_id === inv.id) || [];
    // Tally likes YYYYMMDD for dates in default template
    const invDate = inv.invoice_date ? inv.invoice_date.replace(/-/g, '') : ''; 
    const invType = inv.invoice_type || 'Tax Invoice';
    let vchType = "Purchase";
    if (invType === 'Credit Note') vchType = "Credit Note";
    if (invType === 'Debit Note') vchType = "Debit Note";
    
    const isBillOfSupply = invType === 'Bill of Supply';
    const isCreditDebit = invType === 'Credit Note' || invType === 'Debit Note';
    const mult = isCreditDebit ? -1 : 1;
    
    const partyDrCr = mult > 0 ? 'Cr' : 'Dr';
    const expenseDrCr = mult > 0 ? 'Dr' : 'Cr';

    // 1. Party Ledger (Total Amount)
    tallyData.push({
      'Voucher Date': invDate,
      'Voucher Type Name': vchType,
      'Voucher Number': inv.invoice_number || '',
      'Ledger Name': inv.supplier_name || 'Cash',
      'Ledger Amount': (inv.total_amount || 0),
      'Ledger Amount Dr/Cr': partyDrCr,
    });
    
    // 2. Expense Ledgers (Line Items)
    if (items.length > 0) {
      items.forEach((item: any) => {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': inv.expense_category || 'Purchase A/c',
          'Ledger Amount': (item.amount || 0),
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      });
    } else {
      // Fallback if no line items
      tallyData.push({
        'Voucher Date': invDate,
        'Voucher Type Name': vchType,
        'Voucher Number': inv.invoice_number || '',
        'Ledger Name': inv.expense_category || 'Purchase A/c',
        'Ledger Amount': (inv.taxable_amount || 0),
        'Ledger Amount Dr/Cr': expenseDrCr,
      });
    }

    // 3. Tax Ledgers
    if (!isBillOfSupply) {
      if (inv.cgst_amount) {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': 'CGST',
          'Ledger Amount': (inv.cgst_amount),
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      }
      if (inv.sgst_amount) {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': 'SGST',
          'Ledger Amount': (inv.sgst_amount),
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      }
      if (inv.igst_amount) {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': 'IGST',
          'Ledger Amount': (inv.igst_amount),
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      }
      if (inv.cess_amount) {
        tallyData.push({
          'Voucher Date': invDate,
          'Voucher Type Name': vchType,
          'Voucher Number': inv.invoice_number || '',
          'Ledger Name': 'Cess',
          'Ledger Amount': (inv.cess_amount),
          'Ledger Amount Dr/Cr': expenseDrCr,
        });
      }
    }
  });

  const workbook = XLSX.utils.book_new();
  const tallySheet = XLSX.utils.json_to_sheet(tallyData);
  XLSX.utils.book_append_sheet(workbook, tallySheet, "Accounting Vouchers");

  XLSX.writeFile(workbook, "Tally_Import_Template.xlsx");
};

const escapeXml = (unsafe: string) => {
  return (unsafe || '').toString().replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

export const exportToTallyXML = (filteredInvoices: any[], allLineItems: any[]) => {
  let xmlStr = `<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

  filteredInvoices.forEach(inv => {
    const items = allLineItems?.filter(li => li.invoice_id === inv.id) || [];
    const invDate = inv.invoice_date ? inv.invoice_date.replace(/-/g, '') : '';
    
    const invType = inv.invoice_type || 'Tax Invoice';
    let vchType = "Purchase";
    if (invType === 'Credit Note') vchType = "Credit Note";
    if (invType === 'Debit Note') vchType = "Debit Note";
    
    const isBillOfSupply = invType === 'Bill of Supply';
    const isCreditDebit = invType === 'Credit Note' || invType === 'Debit Note';
    
    // In Tally: Purchase -> Party is Positive (Credit), Expense is Negative (Debit)
    // For Credit Note -> Party is Negative (Debit), Expense is Positive (Credit)
    const mult = isCreditDebit ? -1 : 1;

    xmlStr += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xmlStr += `          <VOUCHER VCHTYPE="${vchType}" ACTION="Create">\n`;
    xmlStr += `            <DATE>${invDate}</DATE>\n`;
    xmlStr += `            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>\n`;
    xmlStr += `            <VOUCHERNUMBER>${escapeXml(inv.invoice_number || '')}</VOUCHERNUMBER>\n`;
    xmlStr += `            <PARTYLEDGERNAME>${escapeXml(inv.supplier_name || '')}</PARTYLEDGERNAME>\n`;
    xmlStr += `            <PARTYNAME>${escapeXml(inv.supplier_name || '')}</PARTYNAME>\n`;
    
    if (isCreditDebit && (inv.original_invoice_number || inv.original_invoice_date)) {
        xmlStr += `            <NARRATION>Original Invoice: ${escapeXml(inv.original_invoice_number || '')} dated ${escapeXml(inv.original_invoice_date || '')}</NARRATION>\n`;
    }
    
    // Ledger entries
    xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
    xmlStr += `              <LEDGERNAME>${escapeXml(inv.supplier_name || '')}</LEDGERNAME>\n`;
    xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
    xmlStr += `              <AMOUNT>${(inv.total_amount || 0) * mult}</AMOUNT>\n`;
    xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;

    items.forEach(item => {
       xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
       xmlStr += `              <LEDGERNAME>${escapeXml(inv.expense_category || 'Purchase')}</LEDGERNAME>\n`;
       xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
       xmlStr += `              <AMOUNT>${-(item.amount || 0) * mult}</AMOUNT>\n`;
       xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
    });
    
    if (!isBillOfSupply) {
      if (inv.cgst_amount) {
         xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
         xmlStr += `              <LEDGERNAME>CGST</LEDGERNAME>\n`;
         xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
         xmlStr += `              <AMOUNT>${-(inv.cgst_amount) * mult}</AMOUNT>\n`;
         xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
      }
      if (inv.sgst_amount) {
         xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
         xmlStr += `              <LEDGERNAME>SGST</LEDGERNAME>\n`;
         xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
         xmlStr += `              <AMOUNT>${-(inv.sgst_amount) * mult}</AMOUNT>\n`;
         xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
      }
      if (inv.igst_amount) {
         xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
         xmlStr += `              <LEDGERNAME>IGST</LEDGERNAME>\n`;
         xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
         xmlStr += `              <AMOUNT>${-(inv.igst_amount) * mult}</AMOUNT>\n`;
         xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
      }
      if (inv.cess_amount) {
         xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
         xmlStr += `              <LEDGERNAME>Cess</LEDGERNAME>\n`;
         xmlStr += `              <ISDEEMEDPOSITIVE>${mult > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
         xmlStr += `              <AMOUNT>${-(inv.cess_amount) * mult}</AMOUNT>\n`;
         xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
      }
    }

    xmlStr += `          </VOUCHER>\n`;
    xmlStr += `        </TALLYMESSAGE>\n`;
  });

  xmlStr += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;

  const blob = new Blob([xmlStr], { type: 'application/xml' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Tally_Vouchers.xml';
  a.click();
  window.URL.revokeObjectURL(url);
};

export const exportToRawExcel = (
  invoices: any[], 
  allLineItems: any[], 
  selectedColumns: string[], 
  includeItems: boolean
) => {
  const rawData: any[] = [];
  
  // Create a map of column keys to labels
  const colMap = AVAILABLE_COLUMNS.reduce((acc, col) => {
    acc[col.key] = col.label;
    return acc;
  }, {} as Record<string, string>);

  invoices.forEach(inv => {
    const items = allLineItems?.filter(li => li.invoice_id === inv.id) || [];
    
    // Base row with selected invoice columns
    const baseRow: any = {};
    selectedColumns.forEach(colKey => {
      // Map the DB field to the selected column
      const dbField = colKey.toLowerCase();
      let val = inv[dbField];
      if (val === undefined || val === null) {
        val = '';
      }
      baseRow[colMap[colKey] || colKey] = val;
    });

    if (includeItems && items.length > 0) {
      items.forEach(item => {
        const row = { ...baseRow };
        // Append line item fields
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
        // Still add the columns even if no items, to keep headers consistent
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
  XLSX.utils.book_append_sheet(workbook, rawSheet, "Custom Report");

  XLSX.writeFile(workbook, "Custom_Invoice_Export.xlsx");
};
