import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Loader2, FileText, Search, Filter, Settings, CheckCircle2, Trash2, AlertTriangle, Table2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMNS } from '../lib/constants';
import { useClient } from '../lib/ClientContext';
import { exportToTallyXML, exportToRawExcel } from '../lib/exportService';
import { InvoiceDetailsModal } from '../components/InvoiceDetailsModal';
import { ExportFieldPicker } from '../components/ExportFieldPicker';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { formatCurrency } from '../utils/format';
import { maskPAN, maskBankAccount, maskPhone, maskEmail } from '../utils/masking';
import { Eye, EyeOff } from 'lucide-react';

export default function SavedInvoicesPage() {
  const { activeClientId } = useClient();
  const queryClient = useQueryClient();
  
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchTerm, sortField, sortDirection]);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('tally_ledgers, export_columns, export_include_items').eq('id', session.user.id).single();
      return data;
    }
  });
  const defaultLedgers = ['Travel', 'Office Supplies', 'IT Software', 'Professional Fees', 'Raw Materials', 'Rent', 'Utilities', 'Meals & Entertainment', 'Marketing', 'Other'];
  const categoryOptions = profile?.tally_ledgers || defaultLedgers;

  const { data: rawInvoicesData, isLoading: invoicesLoading, isError: invoicesError, refetch: refetchInvoices } = useQuery({
    queryKey: ['invoices', 'list', activeClientId, currentPage, debouncedSearchTerm, sortField, sortDirection],
    queryFn: async () => {
      if (!activeClientId) return { data: [], count: 0 };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { data: [], count: 0 };

      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('user_id', session.user.id)
        .eq('client_id', activeClientId);

      if (debouncedSearchTerm) {
        query = query.or(`supplier_name.ilike.%${debouncedSearchTerm}%,buyer_name.ilike.%${debouncedSearchTerm}%,invoice_number.ilike.%${debouncedSearchTerm}%`);
      }

      const { data: queryData, error: queryError, count } = await query
        .order(sortField, { ascending: sortDirection === 'asc' })
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
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [showSensitiveData, setShowSensitiveData] = useState(false);
  
  // Filters
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



  // Invoices array directly from server
  const filteredInvoices = invoices;

  const getInvoicesToExport = () => {
    let toExport = filteredInvoices;
    if (selectedIds.size > 0) {
      toExport = filteredInvoices.filter(inv => selectedIds.has(inv.id));
    }
    const isFirm = localStorage.getItem('accountType') === 'firm';
    if (isFirm) {
      const approvedOnly = toExport.filter(inv => inv.approval_status !== 'pending_approval');
      if (approvedOnly.length < toExport.length) {
         toast.error(`Skipped ${toExport.length - approvedOnly.length} invoice(s) pending approval.`);
      }
      return approvedOnly;
    }
    return toExport;
  };


  const handleCustomExportConfirm = async (columns: string[], includeItems: boolean, remember: boolean) => {
    setShowExportPicker(false);
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (remember && session) {
      await supabase.from('profiles').update({
        export_columns: columns,
        export_include_items: includeItems
      }).eq('id', session.user.id);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }

    const toExport = getInvoicesToExport();
    if (toExport.length === 0) {
      toast.error("No invoices to export.");
      return;
    }

    setIsExporting(true);
    try {
      const invoiceIds = toExport.map(inv => inv.id);
      const { data: allLineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);
        
      if (error) throw error;
      
      exportToRawExcel(toExport, allLineItems || [], columns, includeItems);
    } catch (err) {
      console.error("Custom Export failed:", err);
      toast.error("Failed to generate custom export.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTallyXML = async () => {
    const toExport = getInvoicesToExport();
    if (toExport.length === 0) {
      toast.error("No invoices to export.");
      return;
    }
    
    setIsExporting(true);
    try {
      const invoiceIds = toExport.map(inv => inv.id);
      const { data: allLineItems, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .in('invoice_id', invoiceIds);
        
      if (error) throw error;
      
      exportToTallyXML(toExport, allLineItems || []);
      toast.success("Exported to Tally XML successfully!");
    } catch (err) {
      console.error("XML Export failed:", err);
      toast.error("Failed to export to Tally XML.");
    } finally {
      setIsExporting(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const confirmStr = `Are you sure you want to delete ${selectedIds.size} invoice(s)? This action cannot be undone.`;
    if (!window.confirm(confirmStr)) return;

    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase.from('invoices').delete().in('id', idsToDelete);
      if (error) throw error;
      
      toast.success(`Successfully deleted ${idsToDelete.length} invoice(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error("Failed to delete invoices.");
    } finally {
      setIsDeleting(false);
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

  const handleApprove = async (invoiceId: string) => {
    try {
      const { error } = await supabase.from('invoices').update({ approval_status: 'approved' }).eq('id', invoiceId);
      if (error) throw error;
      toast.success("Invoice Approved");
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Update local state if modal is open
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        setSelectedInvoice({ ...selectedInvoice, approval_status: 'approved' });
      }
    } catch (e) {
      console.error("Failed to approve", e);
      toast.error("Failed to approve invoice");
    }
  };


  if (invoicesError) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
        <ErrorState 
           
          message="There was a problem communicating with the server. Please try again."
          onRetry={refetchInvoices}
        />
      </div>
    );
  }

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
          
          {selectedIds.size > 0 && (
            <button 
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="btn-ghost text-error hover:bg-error-subtle hover:border-error/20 flex-1 md:flex-none disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete ({selectedIds.size})
            </button>
          )}


          
          <button 
            onClick={() => setShowExportPicker(true)}
            disabled={isExporting || filteredInvoices.length === 0}
            className="btn-ghost flex-1 md:flex-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />}
            {selectedIds.size > 0 ? `Custom Report (${selectedIds.size})` : 'Custom Report'}
          </button>
          
          <button 
            onClick={handleExportTallyXML}
            disabled={isExporting || filteredInvoices.length === 0}
            className="btn-primary flex-1 md:flex-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {selectedIds.size > 0 ? `Tally XML (${selectedIds.size})` : 'Tally XML'}
          </button>

          <div className="relative">
            <button 
              onClick={() => setShowSensitiveData(!showSensitiveData)}
              title={showSensitiveData ? "Hide Sensitive Data (PAN, Account)" : "Show Sensitive Data"}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border"
            >
              {showSensitiveData ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border"
              
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
        
        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col p-4 gap-3 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {filteredInvoices.map(inv => (
            <div 
              key={inv.id} 
              className="bg-bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm active:scale-[0.98] transition-transform"
              onClick={() => handleRowClick(inv)}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <h3 className="font-semibold text-text-primary text-sm truncate flex items-center gap-2">
                    {inv.supplier_name || 'Unknown Supplier'}
                    {inv.hsn_audit_warning && <AlertTriangle className="w-4 h-4 text-error shrink-0"  />}
                  </h3>
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    {inv.invoice_number || 'No Inv#'} • {inv.invoice_date || '-'}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="font-mono font-bold text-text-primary text-sm">
                    {inv.total_invoice_amount ? formatCurrency(Number(inv.total_invoice_amount)) : '-'}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
                <div className="flex items-center gap-2">
                  {inv.supplier_gstin_status === 'Active' ? (
                    <span className="badge bg-success-subtle text-success border border-success/20 px-2 py-0.5 rounded-full text-[10px]">Active</span>
                  ) : inv.supplier_gstin_status === 'Cancelled' ? (
                    <span className="badge bg-error-subtle text-error border border-error/20 px-2 py-0.5 rounded-full text-[10px]">Cancelled</span>
                  ) : inv.supplier_gstin_status ? (
                    <span className="badge bg-bg-sunken text-text-secondary border border-border px-2 py-0.5 rounded-full text-[10px]">{inv.supplier_gstin_status}</span>
                  ) : null}
                </div>
                
                <div>
                  {inv.extraction_state === 'needs_retry' ? (
                    <span className="badge bg-error-subtle text-error border border-error/20 text-[10px]">Needs Retry</span>
                  ) : inv.extraction_state === 'needs_review' ? (
                    <span className="badge bg-warning-subtle text-warning border border-warning/20 text-[10px]">Review</span>
                  ) : (
                    <span className="badge bg-success-subtle text-success border border-success/20 text-[10px]">Processed</span>
                  )}
                  {inv.approval_status === 'pending_approval' && (
                    <span className="badge bg-warning-subtle text-warning border border-warning/20 text-[10px] ml-2">Pending Appr.</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredInvoices.length === 0 && (
            <div className="py-8 text-center text-text-secondary flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 opacity-50" />
              <p className="text-sm">No invoices found.</p>
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[65vh] custom-scrollbar relative">
          <table className="w-full text-sm text-left relative">
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
                <th 
                  className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:text-accent"
                  onClick={() => {
                    if (sortField === 'file_name') setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortField('file_name'); setSortDirection('asc'); }
                  }}
                >
                  <div className="flex items-center gap-1">
                    Filename {sortField === 'file_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                {visibleColumns.map(col => {
                  const colDef = AVAILABLE_COLUMNS.find(c => c.key === col);
                  const isAmount = col.includes('Amount') || col === 'Round_Off';
                  const dbField = col.toLowerCase();
                  return (
                    <th 
                      key={col} 
                      className={cn("p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-accent transition-colors", isAmount ? "text-right" : "")}
                      onClick={() => {
                        if (sortField === dbField) {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField(dbField);
                          setSortDirection('asc');
                        }
                      }}
                    >
                      <div className={cn("flex items-center gap-1", isAmount ? "justify-end" : "")}>
                        {colDef?.label}
                        {sortField === dbField && (
                          <span className="text-accent">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="p-4 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</th>
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
                    <div className="flex items-center gap-2">
                      {inv.file_name || 'Unknown'}
                      {inv.hsn_audit_warning && <AlertTriangle className="w-4 h-4 text-error shrink-0"  />}
                    </div>
                  </td>
                  {visibleColumns.map(col => {
                    const isAmount = col.includes('Amount') || col === 'Round_Off';
                    let val = inv[col.toLowerCase()] || '';
                    
                    if (!showSensitiveData && val) {
                      if (col.includes('PAN')) val = maskPAN(val);
                      else if (col === 'Account_Number') val = maskBankAccount(val);
                      else if (col === 'Supplier_Phone') val = maskPhone(val);
                      else if (col === 'Supplier_Email') val = maskEmail(val);
                    }

                    return (
                      <td key={col} className={cn("p-4 text-sm text-text-secondary whitespace-nowrap", isAmount ? "text-right font-mono" : "")}>
                        {col === 'Supplier_GSTIN_Status' ? (
                          val === 'Active' ? (
                            <span className="badge bg-success-subtle text-success border border-success/20 px-2 py-0.5 rounded-full text-xs">Active</span>
                          ) : val === 'Cancelled' ? (
                            <span className="badge bg-error-subtle text-error border border-error/20 px-2 py-0.5 rounded-full text-xs">Cancelled</span>
                          ) : val ? (
                            <span className="badge bg-bg-sunken text-text-secondary border border-border px-2 py-0.5 rounded-full text-xs">{val}</span>
                          ) : '-'
                        ) : col === 'Expense_Category' ? (
                          <select
                            onClick={(e) => e.stopPropagation()}
                            value={val}
                            onChange={(e) => handleUpdateCategory(inv.id, e.target.value)}
                            className="bg-bg-sunken border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          >
                            <option value="">Select Category</option>
                            {categoryOptions.map((cat: string) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            {!categoryOptions.includes(val) && val && <option value={val}>{val}</option>}
                          </select>
                        ) : isAmount && val ? formatCurrency(Number(val)) : val || '-'}
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
                    {inv.approval_status === 'pending_approval' && (
                      <div className="mt-1">
                        <span className="badge bg-warning-subtle text-warning border border-warning/20 text-[10px]">Pending Appr.</span>
                      </div>
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

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-bg-surface border border-border shadow-xl rounded-full px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4 max-w-[90vw] overflow-x-auto custom-scrollbar"
          >
            <span className="text-sm font-medium text-text-primary whitespace-nowrap">
              <span className="text-accent font-bold">{selectedIds.size}</span> selected
            </span>
            <div className="w-px h-6 bg-border mx-1 md:mx-2 shrink-0" />
            <button 
              onClick={() => setShowExportPicker(true)}
              disabled={isExporting}
              className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Table2 className="w-4 h-4" /> <span className="hidden sm:inline">Custom Report</span>
            </button>

            <button 
              onClick={handleExportTallyXML}
              disabled={isExporting}
              className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Tally XML</span>
            </button>
            <button 
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-2 text-sm font-medium text-error hover:text-error/80 transition-colors ml-1 md:ml-2 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <InvoiceDetailsModal 
        selectedInvoice={selectedInvoice}
        invoiceLineItems={invoiceLineItems}
        loadingDetails={loadingDetails}
        closeModal={closeModal}
        handleUpdateCategory={handleUpdateCategory}
        setSelectedInvoice={setSelectedInvoice}
        handleApprove={handleApprove}
      />
      <ExportFieldPicker 
        isOpen={showExportPicker}
        onClose={() => setShowExportPicker(false)}
        onConfirm={handleCustomExportConfirm}
        initialColumns={profile?.export_columns || DEFAULT_COLUMNS}
        initialIncludeItems={profile?.export_include_items ?? true}
      />
    </div>
  );
}
