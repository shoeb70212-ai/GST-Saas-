import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type LineItem = {
  Description?: string;
  HSN_SAC?: string;
  Quantity?: number;
  Unit_Price?: number;
  Amount?: number;
  Tax_Rate?: number;
};

export type InvoiceData = {
  Expense_Category?: string;
  Extraction_State?: string;
  Confidence_Score?: number;
  Supplier_Name?: string;
  Supplier_Address?: string;
  Supplier_Phone?: string;
  Supplier_Email?: string;
  Supplier_GSTIN?: string;
  Supplier_PAN?: string;
  Buyer_Name?: string;
  Buyer_Address?: string;
  Buyer_PIN?: string;
  Buyer_GSTIN?: string;
  Buyer_PAN?: string;
  Place_Of_Supply?: string;
  Invoice_Date?: string;
  Due_Date?: string;
  Invoice_Number?: string;
  PO_Number?: string;
  E_Way_Bill_Number?: string;
  Vehicle_Number?: string;
  Taxable_Amount?: number;
  CGST_Amount?: number;
  SGST_Amount?: number;
  IGST_Amount?: number;
  Round_Off?: number;
  Total_Amount?: number;
  GST_Amount?: number;
  Amount_In_Words?: string;
  Received_Amount?: number;
  Balance_Amount?: number;
  Previous_Balance?: number;
  Current_Balance?: number;
  Account_Holder?: string;
  Account_Number?: string;
  Bank_Name?: string;
  Branch_Name?: string;
  IFSC_Code?: string;
  UPI_ID?: string;
  Line_Items?: LineItem[];
  [key: string]: any; 
};

export type FileState = {
  id: string;
  file: File;
  previewUrl: string | null;
  isScanning: boolean;
  extractedData: InvoiceData | null;
  error: string | null;
  savedToCloud?: boolean;
};

export const AVAILABLE_COLUMNS = [
  { key: 'Extraction_State', label: 'Status' },
  { key: 'Expense_Category', label: 'Category' },
  { key: 'Confidence_Score', label: 'Confidence %' },
  { key: 'Supplier_Name', label: 'Supplier Name' },
  { key: 'Supplier_Address', label: 'Supplier Address' },
  { key: 'Supplier_Phone', label: 'Supplier Phone' },
  { key: 'Supplier_Email', label: 'Supplier Email' },
  { key: 'Supplier_GSTIN', label: 'Supplier GSTIN' },
  { key: 'Supplier_PAN', label: 'Supplier PAN' },
  { key: 'Buyer_Name', label: 'Buyer Name' },
  { key: 'Buyer_Address', label: 'Buyer Address' },
  { key: 'Buyer_PIN', label: 'Buyer PIN' },
  { key: 'Buyer_GSTIN', label: 'Buyer GSTIN' },
  { key: 'Buyer_PAN', label: 'Buyer PAN' },
  { key: 'Place_Of_Supply', label: 'Place of Supply' },
  { key: 'Invoice_Date', label: 'Date' },
  { key: 'Due_Date', label: 'Due Date' },
  { key: 'Invoice_Number', label: 'Invoice #' },
  { key: 'PO_Number', label: 'PO Number' },
  { key: 'E_Way_Bill_Number', label: 'E-Way Bill' },
  { key: 'Vehicle_Number', label: 'Vehicle Number' },
  { key: 'Taxable_Amount', label: 'Taxable' },
  { key: 'CGST_Amount', label: 'CGST' },
  { key: 'SGST_Amount', label: 'SGST' },
  { key: 'IGST_Amount', label: 'IGST' },
  { key: 'Round_Off', label: 'Round Off' },
  { key: 'Total_Amount', label: 'Total' },
  { key: 'GST_Amount', label: 'GST Total' },
  { key: 'Amount_In_Words', label: 'Amount in Words' },
  { key: 'Received_Amount', label: 'Received' },
  { key: 'Balance_Amount', label: 'Balance' },
  { key: 'Previous_Balance', label: 'Prev Balance' },
  { key: 'Current_Balance', label: 'Curr Balance' },
  { key: 'Account_Holder', label: 'Acct Holder' },
  { key: 'Account_Number', label: 'Acct Number' },
  { key: 'Bank_Name', label: 'Bank Name' },
  { key: 'Branch_Name', label: 'Branch Name' },
  { key: 'IFSC_Code', label: 'IFSC Code' },
  { key: 'UPI_ID', label: 'UPI ID' },
];

export const DEFAULT_COLUMNS = [
  'Expense_Category',
  'Confidence_Score',
  'Supplier_Name',
  'Invoice_Date',
  'Invoice_Number',
  'Total_Amount',
  'GST_Amount',
];

interface ScanContextType {
  fileStates: FileState[];
  setFileStates: React.Dispatch<React.SetStateAction<FileState[]>>;
  visibleColumns: string[];
  setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);

  useEffect(() => {
    const saved = localStorage.getItem('payforce_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const allColumns = Array.from(new Set([...parsed, ...DEFAULT_COLUMNS]));
        setVisibleColumns(allColumns as string[]);
      } catch (e) {}
    }
  }, []);

  return (
    <ScanContext.Provider value={{ fileStates, setFileStates, visibleColumns, setVisibleColumns }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  const context = useContext(ScanContext);
  if (context === undefined) {
    throw new Error('useScanContext must be used within a ScanProvider');
  }
  return context;
}
