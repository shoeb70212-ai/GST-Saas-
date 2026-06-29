import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Loader2, FileText, Search, Download, X, DollarSign, Filter, Building2, MapPin, Settings, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS } from '../lib/ScanContext';
import { useClient } from '../lib/ClientContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
};

export default function SavedInvoicesPage() {
  const { activeClientId } = useClient();
  
  const { data: rawInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data: queryData, error: queryError } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('client_id', activeClientId)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return queryData || [];
    },
    enabled: !!activeClientId,
  });

  const invoices = rawInvoices || [];
  const loading = invoicesLoading;

  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      localStorage.setItem('payforce_columns', JSON.stringify(next));
      return next;
    });
  };

  // Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceLineItems, setInvoiceLineItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleRowClick = async (invoice: any) => {
    setSelectedInvoice(invoice);
    setLoadingDetails(true);
    setInvoiceLineItems([]);
    try {
      const { data, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoice.id);
      
      if (error) throw error;
      if (data) setInvoiceLineItems(data);
    } catch (error) {
      console.error('Error fetching line items:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeModal = () => {
    setSelectedInvoice(null);
    setInvoiceLineItems([]);
  };



  // Apply filters
  const filteredInvoices = invoices.filter(inv => {
    let matches = true;

    // Search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = (inv.supplier_name && inv.supplier_name.toLowerCase().includes(searchLower)) ||
                            (inv.buyer_name && inv.buyer_name.toLowerCase().includes(searchLower)) ||
                            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(searchLower));
      if (!matchesSearch) matches = false;
    }

    return matches;
  });

  const handleExportExcel = async () => {
    if (filteredInvoices.length === 0) {
      toast.error("No invoices to export.");
      return;
    }
    
    setIsExporting(true);
    try {
      // We need to fetch line items for ALL filtered invoices to make a comprehensive export.
      const invoiceIds = filteredInvoices.map(inv => inv.id);
      
      const { data: allLineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);
        
      if (error) throw error;

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

    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export invoices.");
    } finally {
      setIsExporting(false);
    }
  };



  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Saved Invoices</h1>
          <p className="text-text-secondary">View, filter, and export your processed MSME invoices.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all border ${showFilters ? "bg-primary/20 text-primary border-primary/30" : "bg-surface/50 text-textMuted border-white/10 hover:bg-white/5"}`}
          >
            <Filter className="w-4 h-4" /> Filters
          </button>
          
          <button 
            onClick={handleExportExcel}
            disabled={isExporting || filteredInvoices.length === 0}
            className="btn-ghost flex-1 md:flex-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Excel
          </button>

          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border"
              title="Configure Columns"
            >
              <Settings className="w-5 h-5" />
            </button>

            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-border bg-bg-sunken/50">
                    <h3 className="font-semibold text-text-primary text-sm">Visible Columns</h3>
                    <p className="text-xs text-text-secondary mt-1">Select data to display in table</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {AVAILABLE_COLUMNS.map(col => {
                      const isVisible = visibleColumns.includes(col.key);
                      return (
                        <button
                          key={col.key}
                          onClick={() => toggleColumn(col.key)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${isVisible ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-bg-sunken'}`}
                        >
                          <span>{col.label}</span>
                          {isVisible && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="flex-1 w-full relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
                <input 
                  type="text" 
                  placeholder="Search by vendor, invoice number, or GSTIN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field w-full pl-10"
                />
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="table-header">
              <tr>
                <th className="p-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-border bg-bg-sunken text-accent focus:ring-accent"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredInvoices.map(inv => inv.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                  />
                </th>
                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider">Filename</th>
                {visibleColumns.map(col => {
                  const colDef = AVAILABLE_COLUMNS.find(c => c.key === col);
                  const isAmount = col.includes('Amount') || col === 'Round_Off';
                  return (
                    <th key={col} className={cn("p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap", isAmount ? "text-right" : "")}>
                      {colDef?.label}
                    </th>
                  );
                })}
                <th className="p-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="table-row cursor-pointer" onClick={() => handleRowClick(inv)}>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      className="rounded border-border bg-bg-sunken text-accent focus:ring-accent"
                      checked={selectedIds.has(inv.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedIds);
                        if (e.target.checked) newSet.add(inv.id);
                        else newSet.delete(inv.id);
                        setSelectedIds(newSet);
                      }}
                    />
                  </td>
                  <td className="p-4 whitespace-nowrap text-text-primary text-sm font-medium">
                    {inv.file_name || 'Unknown'}
                  </td>
                  {visibleColumns.map(col => {
                    const isAmount = col.includes('Amount') || col === 'Round_Off';
                    const val = inv[col.toLowerCase()] || '';
                    return (
                      <td key={col} className={cn("p-4 text-sm text-text-secondary whitespace-nowrap", isAmount ? "text-right font-mono" : "")}>
                        {isAmount && val ? formatCurrency(Number(val)) : val || '-'}
                      </td>
                    );
                  })}
                  <td className="p-4 text-center">
                    {(inv.confidence_score || 0) > 80 ? (
                      <span className="badge bg-success-subtle text-success border border-success/20">Processed</span>
                    ) : (
                      <span className="badge bg-warning-subtle text-warning border border-warning/20">Review</span>
                    )}
                  </td>
                </tr>
              ))}
              
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 opacity-50" />
                      <p>No invoices found matching your criteria.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedInvoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-overlay/80 backdrop-blur-sm z-50 flex justify-end"
            onClick={closeModal}
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-2xl bg-bg-surface h-full border-l border-border overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-border flex justify-between items-start sticky top-0 bg-bg-surface/90 backdrop-blur-md z-10">
                <div>
                  <h2 className="text-xl font-bold text-text-primary mb-1">Invoice Details</h2>
                  <p className="text-sm text-text-secondary font-mono">{selectedInvoice.invoice_number}</p>
                </div>
                <button 
                  onClick={closeModal}
                  className="p-2 hover:bg-bg-sunken rounded-lg text-text-secondary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Party Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier */}
                  <div className="card bg-bg-surface p-4 border border-border">
                    <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Supplier Details</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-text-secondary uppercase">Name</div>
                        <div className="font-medium text-text-primary">{selectedInvoice.supplier_name || '-'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-text-secondary uppercase">GSTIN</div>
                          <div className="font-mono text-sm">{selectedInvoice.supplier_gstin || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-secondary uppercase">PAN</div>
                          <div className="font-mono text-sm">{selectedInvoice.supplier_pan || '-'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary uppercase">Address</div>
                        <div className="text-sm text-text-secondary">{selectedInvoice.supplier_address || '-'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-text-secondary uppercase">Phone</div>
                          <div className="text-sm">{selectedInvoice.supplier_phone || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-secondary uppercase">Email</div>
                          <div className="text-sm break-all">{selectedInvoice.supplier_email || '-'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Buyer */}
                  <div className="card bg-bg-surface p-4 border border-border">
                    <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-accent" /> Buyer Details</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-text-secondary uppercase">Name</div>
                        <div className="font-medium text-text-primary">{selectedInvoice.buyer_name || '-'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-text-secondary uppercase">GSTIN</div>
                          <div className="font-mono text-sm">{selectedInvoice.buyer_gstin || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-secondary uppercase">PAN</div>
                          <div className="font-mono text-sm">{selectedInvoice.buyer_pan || '-'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary uppercase">Address</div>
                        <div className="text-sm text-text-secondary">{selectedInvoice.buyer_address || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary uppercase">PIN Code</div>
                        <div className="text-sm font-mono">{selectedInvoice.buyer_pin || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping & Document Info */}
                <div className="card bg-bg-surface p-4 border border-border">
                  <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Shipping & Document Info</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-text-secondary uppercase">Invoice Date</div>
                      <div className="font-medium">{selectedInvoice.invoice_date || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary uppercase">Due Date</div>
                      <div className="font-medium">{selectedInvoice.due_date || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary uppercase">Place of Supply</div>
                      <div className="font-medium">{selectedInvoice.place_of_supply || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary uppercase">PO Number</div>
                      <div className="font-mono text-sm">{selectedInvoice.po_number || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary uppercase">E-Way Bill</div>
                      <div className="font-mono text-sm">{selectedInvoice.e_way_bill_number || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary uppercase">Vehicle No</div>
                      <div className="font-mono text-sm">{selectedInvoice.vehicle_number || '-'}</div>
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="card bg-bg-surface p-4 border border-border">
                  <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-accent" /> Financial Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Taxable Amount</span>
                        <span className="font-mono text-text-primary">{formatCurrency(selectedInvoice.taxable_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">CGST</span>
                        <span className="font-mono text-text-primary">{formatCurrency(selectedInvoice.cgst_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">SGST</span>
                        <span className="font-mono text-text-primary">{formatCurrency(selectedInvoice.sgst_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">IGST</span>
                        <span className="font-mono text-text-primary">{formatCurrency(selectedInvoice.igst_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Round Off</span>
                        <span className="font-mono text-text-primary">{formatCurrency(selectedInvoice.round_off || 0)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between p-2 bg-accent-subtle rounded-lg border border-accent/20">
                        <span className="text-accent text-sm font-medium">Total Amount</span>
                        <span className="font-mono text-accent font-bold">{formatCurrency(selectedInvoice.total_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Received Amount</span>
                        <span className="font-mono text-success">{formatCurrency(selectedInvoice.received_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Balance Due</span>
                        <span className="font-mono text-warning">{formatCurrency(selectedInvoice.balance_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Previous Balance</span>
                        <span className="font-mono text-text-secondary">{formatCurrency(selectedInvoice.previous_balance || 0)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-bg-sunken rounded-lg">
                        <span className="text-text-secondary text-sm">Current Balance</span>
                        <span className="font-mono text-text-secondary">{formatCurrency(selectedInvoice.current_balance || 0)}</span>
                      </div>
                    </div>
                  </div>
                  {selectedInvoice.amount_in_words && (
                    <div className="mt-4 p-3 bg-bg-sunken rounded-lg border border-border">
                      <div className="text-xs text-text-secondary uppercase mb-1">Amount in Words</div>
                      <div className="text-sm font-medium text-text-primary italic">{selectedInvoice.amount_in_words}</div>
                    </div>
                  )}
                </div>

                {/* Line Items */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-text-primary border-b border-border pb-2">Line Items</h3>
                  {loadingDetails ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
                  ) : invoiceLineItems.length === 0 ? (
                    <div className="text-center p-8 border border-border border-dashed rounded-lg text-text-secondary bg-bg-sunken">No line items found.</div>
                  ) : (
                    <div className="card p-0 overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="table-header">
                          <tr>
                            <th className="p-3">Description</th>
                            <th className="p-3">HSN/SAC</th>
                            <th className="p-3 text-right">Qty</th>
                            <th className="p-3 text-right">Rate</th>
                            <th className="p-3 text-right">Tax %</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceLineItems.map((item, idx) => (
                            <tr key={item.id || idx} className="table-row">
                              <td className="p-3 text-text-primary">{item.description || '-'}</td>
                              <td className="p-3 text-text-secondary font-mono">{item.hsn_sac || '-'}</td>
                              <td className="p-3 text-right text-text-secondary">{item.quantity || '-'}</td>
                              <td className="p-3 text-right text-text-secondary font-mono">{formatCurrency(item.unit_price || 0)}</td>
                              <td className="p-3 text-right text-text-secondary">{item.tax_rate || '0'}%</td>
                              <td className="p-3 text-right font-medium text-text-primary font-mono">{formatCurrency(item.amount || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Bank Details */}
                {(selectedInvoice.account_number || selectedInvoice.upi_id) && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-text-primary border-b border-border pb-2">Payment Details</h3>
                    <div className="card bg-bg-sunken border-0 flex flex-wrap gap-8 p-4">
                      {selectedInvoice.account_number && (
                        <div>
                          <div className="text-xs text-text-secondary uppercase mb-1">Bank Account</div>
                          <div className="font-mono text-text-primary">{selectedInvoice.account_number}</div>
                          <div className="text-sm text-text-secondary">{selectedInvoice.bank_name || ''} {selectedInvoice.ifsc_code ? `(IFSC: ${selectedInvoice.ifsc_code})` : ''}</div>
                        </div>
                      )}
                      {selectedInvoice.upi_id && (
                        <div>
                          <div className="text-xs text-text-secondary uppercase mb-1">UPI ID</div>
                          <div className="font-mono text-text-primary">{selectedInvoice.upi_id}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
