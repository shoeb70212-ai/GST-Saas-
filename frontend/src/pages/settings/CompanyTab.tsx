import { Loader2, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { tabSlide } from './types';

type CompanyTabProps = {
  companyName: string;
  setCompanyName: (v: string) => void;
  gstin: string;
  setGstin: (v: string) => void;
  tallyLedgers: string;
  setTallyLedgers: (v: string) => void;
  makerCheckerEnabled: boolean;
  setMakerCheckerEnabled: (v: boolean) => void;
  userRole: string;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function CompanyTab({
  companyName,
  setCompanyName,
  gstin,
  setGstin,
  tallyLedgers,
  setTallyLedgers,
  makerCheckerEnabled,
  setMakerCheckerEnabled,
  userRole,
  saving,
  onSubmit,
}: CompanyTabProps) {
  return (
    <motion.form
      key="company"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      onSubmit={onSubmit}
      className="card p-6 space-y-5"
    >
      <h2 className="text-lg font-display font-semibold text-text-primary">Company Defaults</h2>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">Company Name</label>
        <input
          type="text"
          required
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          className="input-field w-full"
          placeholder="Your Firm Pvt. Ltd."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">Default GSTIN</label>
        <input
          type="text"
          value={gstin}
          onChange={e => setGstin(e.target.value.toUpperCase())}
          placeholder="27AADCB2230M1Z2"
          className="input-field w-full uppercase font-mono tracking-widest"
        />
        <p className="text-xs text-text-secondary mt-1">Pre-filled on all new invoice scans for this account.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">Custom Tally Ledgers</label>
        <textarea
          value={tallyLedgers}
          onChange={e => setTallyLedgers(e.target.value)}
          placeholder="Printing & Stationery, Legal Fees, CGST Payable, SGST Payable"
          className="input-field w-full min-h-[80px] resize-y"
        />
        <p className="text-xs text-text-secondary mt-1">Comma-separated. The AI will map expenses strictly to these ledgers.</p>
      </div>

      <div className="flex items-center justify-between p-4 bg-bg-sunken rounded-xl border border-border">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Maker-Checker Workflow</h3>
          <p className="text-xs text-text-secondary mt-1">Require manual approval of AI-extracted invoices before export.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle maker-checker workflow">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={makerCheckerEnabled}
            onChange={e => setMakerCheckerEnabled(e.target.checked)}
          />
          <div className="w-11 h-6 bg-border rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/30 peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-bg-surface after:border after:border-border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-transparent" />
        </label>
      </div>

      <div className="pt-4 flex justify-end border-t border-border">
        <button type="submit" disabled={saving || userRole === 'accountant'} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>
    </motion.form>
  );
}
