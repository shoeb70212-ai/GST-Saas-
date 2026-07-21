import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_COLUMNS } from './constants';

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
  Invoice_Type?: string;
  Reverse_Charge_Applicable?: boolean;
  Cess_Amount?: number;
  IRN?: string;
  Original_Invoice_Number?: string;
  Original_Invoice_Date?: string;
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
  /** Client active when the file was queued — used for save even if user switches client later */
  clientId?: string | null;
};



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
    const saved = localStorage.getItem('khatalens_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const allColumns = Array.from(new Set([...parsed, ...DEFAULT_COLUMNS]));
        setVisibleColumns(allColumns as string[]);
      } catch (_e) {}
    }
  }, []);

  return (
    <ScanContext.Provider value={{ fileStates, setFileStates, visibleColumns, setVisibleColumns }}>
      {children}
    </ScanContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useScanContext() {
  const context = useContext(ScanContext);
  if (context === undefined) {
    throw new Error('useScanContext must be used within a ScanProvider');
  }
  return context;
}
