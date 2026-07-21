import { supabase } from '../../lib/supabase';
import type { FileState } from '../../lib/ScanContext';
import { formatDateToIso, safeNum } from './utils';

export async function saveSingleInvoiceToDb(
  _fileId: string,
  fs: FileState,
  data: Record<string, unknown>,
  userId: string,
  clientId: string,
) {
  const invoiceData = {
    user_id: userId,
    client_id: clientId,
    file_name: fs.file.name || 'Unknown',
    supplier_name: data.Supplier_Name,
    supplier_address: data.Supplier_Address,
    supplier_phone: data.Supplier_Phone,
    supplier_email: data.Supplier_Email,
    supplier_gstin: data.Supplier_GSTIN,
    supplier_pan: data.Supplier_PAN,
    buyer_name: data.Buyer_Name,
    buyer_address: data.Buyer_Address,
    buyer_pin: data.Buyer_PIN,
    buyer_gstin: data.Buyer_GSTIN,
    buyer_pan: data.Buyer_PAN,
    place_of_supply: data.Place_Of_Supply,
    invoice_date: formatDateToIso(data.Invoice_Date as string | null | undefined),
    due_date: formatDateToIso(data.Due_Date as string | null | undefined),
    invoice_number: data.Invoice_Number,
    po_number: data.PO_Number,
    e_way_bill_number: data.E_Way_Bill_Number,
    vehicle_number: data.Vehicle_Number,
    taxable_amount: safeNum(data.Taxable_Amount),
    cgst_amount: safeNum(data.CGST_Amount),
    sgst_amount: safeNum(data.SGST_Amount),
    igst_amount: safeNum(data.IGST_Amount),
    round_off: safeNum(data.Round_Off),
    total_amount: safeNum(data.Total_Amount),
    gst_amount: safeNum(data.GST_Amount),
    confidence_score: safeNum(data.Confidence_Score),
    amount_in_words: data.Amount_In_Words,
    received_amount: safeNum(data.Received_Amount),
    balance_amount: safeNum(data.Balance_Amount),
    previous_balance: safeNum(data.Previous_Balance),
    current_balance: safeNum(data.Current_Balance),
    account_holder: data.Account_Holder,
    account_number: data.Account_Number,
    bank_name: data.Bank_Name,
    branch_name: data.Branch_Name,
    ifsc_code: data.IFSC_Code,
    upi_id: data.UPI_ID,
    expense_category: data.Expense_Category,
    invoice_type: data.Invoice_Type,
    reverse_charge_applicable:
      typeof data.Reverse_Charge_Applicable === 'boolean'
        ? data.Reverse_Charge_Applicable
        : null,
    cess_amount: safeNum(data.Cess_Amount),
    irn: data.IRN,
    original_invoice_number: data.Original_Invoice_Number,
    original_invoice_date: formatDateToIso(data.Original_Invoice_Date as string | null | undefined),
    extraction_state: (data.Extraction_State as string) || 'auto_accepted',
  };

  const lineItems = ((data.Line_Items as Array<Record<string, unknown>>) || []).map((item) => ({
    description: item.Description,
    hsn_sac: item.HSN_SAC,
    quantity: safeNum(item.Quantity),
    unit_price: safeNum(item.Unit_Price),
    tax_rate: safeNum(item.Tax_Rate),
    amount: safeNum(item.Amount),
  }));

  const { data: rpcData, error: rpcError } = await supabase.rpc('save_invoice_atomic', {
    invoice_data: invoiceData,
    line_items: lineItems,
  });

  if (rpcError) throw rpcError;
  return rpcData;
}
