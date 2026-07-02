import * as XLSX from 'xlsx';
import { AVAILABLE_COLUMNS } from '../lib/ScanContext';

export const exportToExcelMultiSheet = (invoices: any[], allLineItems: any[], visibleColumns: string[]) => {
  // --- Sheet 1: Summary ---
  const summaryData: any[] = [];
  
  // Fixed GSTR-2B columns
  const fixedKeys = [
    'supplier_gstin', 'supplier_name', 'invoice_number', 'invoice_type', 
    'invoice_date', 'total_amount', 'place_of_supply', 'reverse_charge_applicable', 
    'taxable_amount', 'igst_amount', 'cgst_amount', 'sgst_amount', 'cess_amount'
  ];

  invoices.forEach(inv => {
    const row: any = {};
    
    // 1. Add fixed columns
    row['GSTIN of Supplier'] = inv.supplier_gstin || '';
    row['Trade/Legal Name'] = inv.supplier_name || '';
    row['Invoice Number'] = inv.invoice_number || '';
    row['Invoice Type'] = inv.invoice_type || 'Tax Invoice';
    row['Invoice Date'] = inv.invoice_date || '';
    row['Invoice Value'] = inv.total_amount || '';
    row['Place of Supply'] = inv.place_of_supply || '';
    row['Reverse Charge'] = inv.reverse_charge_applicable ? 'Yes' : 'No';
    row['Taxable Value'] = inv.taxable_amount || '';
    row['Integrated Tax'] = inv.igst_amount || '';
    row['Central Tax'] = inv.cgst_amount || '';
    row['State/UT Tax'] = inv.sgst_amount || '';
    row['Cess'] = inv.cess_amount || '';

    // 2. Add extra visible columns chosen by user that aren't in fixed set
    visibleColumns.forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!fixedKeys.includes(lowerKey)) {
        const colDef = AVAILABLE_COLUMNS.find(c => c.key === key);
        if (colDef) {
          row[colDef.label] = inv[lowerKey] || '';
        }
      }
    });

    summaryData.push(row);
  });

  // --- Sheet 2: Line Items ---
  const lineItemsData: any[] = [];
  
  invoices.forEach(inv => {
    const items = allLineItems?.filter(li => li.invoice_id === inv.id) || [];
    
    const baseData: any = {};
    visibleColumns.forEach(key => {
      const colDef = AVAILABLE_COLUMNS.find(c => c.key === key);
      if (colDef) {
        baseData[colDef.label] = inv[key.toLowerCase()] || '';
      }
    });

    if (items.length > 0) {
      items.forEach(item => {
        lineItemsData.push({
          ...baseData,
          'Item Description': item.description || '',
          'HSN/SAC': item.hsn_sac || '',
          'Qty': item.quantity || '',
          'Rate': item.unit_price || '',
          'Tax %': item.tax_rate || '',
          'Item Amount': item.amount || ''
        });
      });
    } else {
      lineItemsData.push(baseData);
    }
  });

  const workbook = XLSX.utils.book_new();
  
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  
  const lineItemsSheet = XLSX.utils.json_to_sheet(lineItemsData);
  XLSX.utils.book_append_sheet(workbook, lineItemsSheet, "Line Items");

  XLSX.writeFile(workbook, "Saved_Invoices_Export.xlsx");
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
