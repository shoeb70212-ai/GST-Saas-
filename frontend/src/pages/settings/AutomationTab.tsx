import { Loader2, Save, Zap, Network, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { tabSlide } from './types';

type AutomationTabProps = {
  activeClientId: string | null;
  fetchingAutomation: boolean;
  autoApprove: boolean;
  setAutoApprove: (v: boolean) => void;
  runTime: string;
  setRunTime: (v: string) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function AutomationTab({
  activeClientId,
  fetchingAutomation,
  autoApprove,
  setAutoApprove,
  runTime,
  setRunTime,
  saving,
  onSubmit,
}: AutomationTabProps) {
  return (
    <motion.form
      key="automation"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      onSubmit={onSubmit}
      className="card p-6 space-y-5"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-text-primary">Automation Settings</h2>
          <p className="text-sm text-text-secondary font-light">Configure AI reconciliation behavior for the active client.</p>
        </div>
      </div>

      {!activeClientId ? (
        <div className="p-4 bg-warning-subtle text-warning border border-warning/20 rounded-xl text-sm">
          Please select a client from the top navigation to configure their automation settings.
        </div>
      ) : fetchingAutomation ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start justify-between p-4 bg-bg-sunken rounded-xl border border-border transition-colors hover:border-accent/30">
            <div className="flex gap-3">
              <Network className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-text-primary">Auto-Approve Exact Matches</h3>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-sm">
                  When the AI Engine finds a 100% exact match between an invoice and a bank transaction, automatically approve it and update ledgers without manual review.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4" aria-label="Toggle auto approve">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoApprove}
                onChange={e => setAutoApprove(e.target.checked)}
              />
              <div className="w-11 h-6 bg-border rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/30 peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-bg-surface after:border after:border-border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-transparent" />
            </label>
          </div>

          <div className="p-4 border border-border rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-text-secondary" />
              <div>
                <h3 className="text-sm font-medium text-text-primary">Daily Scheduled Run</h3>
                <p className="text-xs text-text-secondary mt-1">
                  Set a time for the AI to automatically sweep new invoices and bank statements.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 pl-8">
              <input
                type="time"
                value={runTime}
                onChange={e => setRunTime(e.target.value)}
                className="input-field"
              />
              <span className="text-sm font-medium text-text-secondary">IST (GMT+5:30)</span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 flex justify-end border-t border-border">
        <button type="submit" disabled={saving || !activeClientId || fetchingAutomation} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Automation
        </button>
      </div>
    </motion.form>
  );
}
