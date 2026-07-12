import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Building2, Settings, MapPin, DollarSign, Loader2 } from 'lucide-react';
import { isValidGSTIN } from '../utils/gstin';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 0 
  }).format(amount);
};

interface InvoiceDetailsModalProps {
  selectedInvoice: any | null;
  invoiceLineItems: any[];
  loadingDetails: boolean;
  closeModal: () => void;
  handleUpdateCategory: (invoiceId: string, category: string) => void;
  setSelectedInvoice: (invoice: any) => void;
}

export function InvoiceDetailsModal({
  selectedInvoice,
  invoiceLineItems,
  loadingDetails,
  closeModal,
  handleUpdateCategory,
  setSelectedInvoice
}: InvoiceDetailsModalProps) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;

  if (!selectedInvoice) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end"
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
          <div className="p-6 border-b border-border flex justify-between items-start sticky top-0 bg-bg-surface/90 backdrop-blur-md z-10 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-1">Invoice Details</h2>
              <p className="text-sm text-text-secondary font-mono">{selectedInvoice.invoice_number}</p>
            </div>
            <button 
              onClick={closeModal}
              className="p-2 hover:bg-bg-sunken active:scale-[0.95] rounded-lg text-text-secondary transition-all"
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-text-secondary uppercase">GSTIN</span>
                        {selectedInvoice.supplier_gstin && (
                            <div className="flex items-center gap-2">
                              {!isValidGSTIN(selectedInvoice.supplier_gstin) ? (
                                <span className="text-[9px] text-red-500 font-medium bg-red-500/10 px-1 rounded">Invalid</span>
                              ) : (
                                <span className="text-[9px] text-green-500 font-medium bg-green-500/10 px-1 rounded">Valid</span>
                              )}
                              <a 
                                href="https://services.gst.gov.in/services/searchtp" 
                                target="_blank" 
                                rel="noreferrer"
                                onClick={() => navigator.clipboard.writeText(selectedInvoice.supplier_gstin)}
                                title="Copy GSTIN and verify on Govt Portal"
                                className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded hover:bg-accent hover:text-white transition-colors cursor-pointer"
                              >
                                Verify
                              </a>
                            </div>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-text-secondary uppercase">GSTIN</span>
                        {selectedInvoice.buyer_gstin && (
                            <div className="flex items-center gap-2">
                              {!isValidGSTIN(selectedInvoice.buyer_gstin) ? (
                                <span className="text-[9px] text-red-500 font-medium bg-red-500/10 px-1 rounded">Invalid</span>
                              ) : (
                                <span className="text-[9px] text-green-500 font-medium bg-green-500/10 px-1 rounded">Valid</span>
                              )}
                              <a 
                                href="https://services.gst.gov.in/services/searchtp" 
                                target="_blank" 
                                rel="noreferrer"
                                onClick={() => navigator.clipboard.writeText(selectedInvoice.buyer_gstin)}
                                title="Copy GSTIN and verify on Govt Portal"
                                className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded hover:bg-accent hover:text-white transition-colors cursor-pointer"
                              >
                                Verify
                              </a>
                            </div>
                        )}
                      </div>
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

            {/* Categorization */}
            <div className="card bg-bg-surface p-4 border border-border">
              <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Categorization</h3>
              <div>
                <label className="text-xs text-text-secondary uppercase mb-2 block">Expense Category</label>
                <select 
                  className="input-field w-full md:w-1/2"
                  value={selectedInvoice.expense_category || ''}
                  onChange={(e) => {
                     const val = e.target.value;
                     setSelectedInvoice({...selectedInvoice, expense_category: val});
                     handleUpdateCategory(selectedInvoice.id, val);
                  }}
                >
                  <option value="">Select Category...</option>
                  <option value="Purchase">Purchase</option>
                  <option value="IT Software">IT Software</option>
                  <option value="Office Supplies">Office Supplies</option>
                  <option value="Travel">Travel</option>
                  <option value="Legal & Professional Fees">Legal & Professional Fees</option>
                  <option value="Advertising & Marketing">Advertising & Marketing</option>
                  <option value="Rent & Lease">Rent & Lease</option>
                  <option value="Utilities">Utilities</option>
                </select>
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
                      {invoiceLineItems.slice(0, page * itemsPerPage).map((item, idx) => (
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
                  {invoiceLineItems.length > page * itemsPerPage && (
                    <div className="p-4 flex justify-center border-t border-border">
                      <button 
                        onClick={() => setPage(p => p + 1)}
                        className="text-sm font-medium text-accent hover:text-accent-hover bg-accent/10 px-4 py-2 rounded-full transition-colors"
                      >
                        Load More ({invoiceLineItems.length - page * itemsPerPage} remaining)
                      </button>
                    </div>
                  )}
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
    </AnimatePresence>
  );
}
