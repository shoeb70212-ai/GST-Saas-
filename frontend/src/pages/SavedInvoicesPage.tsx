import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Loader2, FileText, Search, Download, Filter, Settings, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS } from '../lib/ScanContext';
import { useClient } from '../lib/ClientContext';
import { exportToExcelMultiSheet, exportToTallyXML } from '../lib/exportService';
import { InvoiceDetailsModal } from '../components/InvoiceDetailsModal';
import { Skeleton } from '../components/ui/Skeleton';

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
  const queryClient = useQueryClient();
  
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  const { data: rawInvoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', 'list', activeClientId, currentPage],
    queryFn: async () => {
      if (!activeClientId) return { data: [], count: 0 };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { data: [], count: 0 };

      const { data: queryData, error: queryError, count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('user_id', session.user.id)
        .eq('client_id', activeClientId)
        .order('created_at', { ascending: false })
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      if (queryError) throw queryError;
      return { data: queryData || [], count: count || 0 };
    },
    enabled: !!activeClientId,
  });

  const invoices = rawInvoicesData?.data || [];
  const totalCount = rawInvoicesData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const loading = invoicesLoading;

  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  
  useEffect(() => {
    const saved = localStorage.getItem('khatalens_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const allColumns = Array.from(new Set([...parsed, ...DEFAULT_COLUMNS]));
        setVisibleColumns(allColumns as string[]);
      } catch (e) {
        console.error("Failed to parse saved columns", e);
      }
    }
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      localStorage.setItem('khatalens_columns', JSON.stringify(next));
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
      const invoiceIds = filteredInvoices.map(inv => inv.id);
      const { data: allLineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);
        
      if (error) throw error;
      
      exportToExcelMultiSheet(filteredInvoices, allLineItems || []);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export invoices.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTallyXML = async () => {
    if (filteredInvoices.length === 0) {
      toast.error("No invoices to export.");
      return;
    }
    
    setIsExporting(true);
    try {
      const invoiceIds = filteredInvoices.map(inv => inv.id);
      const { data: allLineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);
        
      if (error) throw error;
      
      exportToTallyXML(filteredInvoices, allLineItems || []);
      toast.success("Exported to Tally XML successfully!");
    } catch (err) {
      console.error("XML Export failed:", err);
      toast.error("Failed to export to Tally XML.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdateCategory = async (invoiceId: string, category: string) => {
    try {
      const { error } = await supabase.from('invoices').update({ expense_category: category }).eq('id', invoiceId);
      if (error) throw error;
      toast.success("Category updated");
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      console.error("Failed to update category", e);
      toast.error("Failed to update category");
    }
  };


  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
        <div className="flex justify-between items-end mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-32" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-b border-border flex justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
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
          
          <button 
            onClick={handleExportTallyXML}
            disabled={isExporting || filteredInvoices.length === 0}
            className="btn-primary flex-1 md:flex-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Tally XML
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
                    {inv.extraction_state === 'needs_retry' ? (
                      <span className="badge bg-error-subtle text-error border border-error/20">Needs Retry</span>
                    ) : inv.extraction_state === 'needs_review' ? (
                      <span className="badge bg-warning-subtle text-warning border border-warning/20">Review</span>
                    ) : (
                      <span className="badge bg-success-subtle text-success border border-success/20">Processed</span>
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
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-bg-surface">
            <span className="text-sm text-text-secondary">
              Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} entries
            </span>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 0} 
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1 text-sm bg-bg-sunken border border-border rounded disabled:opacity-50 text-text-primary hover:bg-bg-base transition-colors"
              >
                Previous
              </button>
              <button 
                disabled={currentPage >= totalPages - 1} 
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 text-sm bg-bg-sunken border border-border rounded disabled:opacity-50 text-text-primary hover:bg-bg-base transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <InvoiceDetailsModal 
        selectedInvoice={selectedInvoice}
        invoiceLineItems={invoiceLineItems}
        loadingDetails={loadingDetails}
        closeModal={closeModal}
        handleUpdateCategory={handleUpdateCategory}
        setSelectedInvoice={setSelectedInvoice}
      />
    </div>
  );
}
