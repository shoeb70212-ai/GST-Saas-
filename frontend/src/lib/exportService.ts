import * as XLSX from 'xlsx';
import { AVAILABLE_COLUMNS } from '../lib/ScanContext';

export const exportToExcel = (filteredInvoices: any[], allLineItems: any[], visibleColumns: string[]) => {
  const dataToExport: any[] = [];

  filteredInvoices.forEach(inv => {
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
        dataToExport.push({
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
      dataToExport.push(baseData);
    }
  });

  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
  XLSX.writeFile(workbook, "Saved_Invoices_Export.xlsx");
};

const escapeXml = (unsafe: string) => {
  return (unsafe || '').replace(/[<>&'"]/g, function (c) {
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
    
    xmlStr += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xmlStr += `          <VOUCHER VCHTYPE="Purchase" ACTION="Create">\n`;
    xmlStr += `            <DATE>${invDate}</DATE>\n`;
    xmlStr += `            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>\n`;
    xmlStr += `            <VOUCHERNUMBER>${escapeXml(inv.invoice_number || '')}</VOUCHERNUMBER>\n`;
    xmlStr += `            <PARTYLEDGERNAME>${escapeXml(inv.supplier_name || '')}</PARTYLEDGERNAME>\n`;
    xmlStr += `            <PARTYNAME>${escapeXml(inv.supplier_name || '')}</PARTYNAME>\n`;
    
    // Ledger entries
    xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
    xmlStr += `              <LEDGERNAME>${escapeXml(inv.supplier_name || '')}</LEDGERNAME>\n`;
    xmlStr += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xmlStr += `              <AMOUNT>${inv.total_amount || 0}</AMOUNT>\n`;
    xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;

    items.forEach(item => {
       xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
       xmlStr += `              <LEDGERNAME>${escapeXml(inv.expense_category || 'Purchase')}</LEDGERNAME>\n`;
       xmlStr += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
       xmlStr += `              <AMOUNT>-${item.amount || 0}</AMOUNT>\n`;
       xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
    });
    
    if (inv.cgst_amount) {
       xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
       xmlStr += `              <LEDGERNAME>CGST</LEDGERNAME>\n`;
       xmlStr += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
       xmlStr += `              <AMOUNT>-${inv.cgst_amount}</AMOUNT>\n`;
       xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
    }
    if (inv.sgst_amount) {
       xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
       xmlStr += `              <LEDGERNAME>SGST</LEDGERNAME>\n`;
       xmlStr += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
       xmlStr += `              <AMOUNT>-${inv.sgst_amount}</AMOUNT>\n`;
       xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
    }
    if (inv.igst_amount) {
       xmlStr += `            <ALLLEDGERENTRIES.LIST>\n`;
       xmlStr += `              <LEDGERNAME>IGST</LEDGERNAME>\n`;
       xmlStr += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
       xmlStr += `              <AMOUNT>-${inv.igst_amount}</AMOUNT>\n`;
       xmlStr += `            </ALLLEDGERENTRIES.LIST>\n`;
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
