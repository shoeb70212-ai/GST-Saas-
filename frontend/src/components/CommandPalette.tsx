import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, FileText, Network, Banknote, Building2,
  CreditCard, Settings, Sparkles, ShieldAlert, TrendingUp, Search, CornerDownLeft, FileOutput, Inbox
} from 'lucide-react';
import { cn } from '../lib/utils';

type PaletteItem = {
  id: string;
  label: string;
  hint: string;
  path: string;
  icon: typeof LayoutDashboard;
  keywords?: string;
};

const COMMANDS: PaletteItem[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Today strip & overview', path: '/app/dashboard', icon: LayoutDashboard, keywords: 'home today' },
  { id: 'scan', label: 'Scan', hint: 'Upload invoices', path: '/app/scan', icon: ScanLine, keywords: 'ocr extract' },
  { id: 'invoices', label: 'Invoices', hint: 'Review purchase register', path: '/app/invoices', icon: FileText, keywords: 'pr books' },
  { id: 'reconcile', label: 'GSTR-2B', hint: 'Match ITC vs books', path: '/app/reconcile', icon: Network, keywords: '2b gst recon' },
  { id: 'itc-risk', label: 'ITC at Risk', hint: 'Blocked / missing-2B ITC', path: '/app/itc-risk', icon: ShieldAlert, keywords: 'itc 17(5) blocked vendor' },
  { id: 'ims', label: 'IMS Cockpit', hint: 'Accept / Reject / Pending', path: '/app/ims', icon: Inbox, keywords: 'ims deemed accept reject' },
  { id: 'bank-statements', label: 'Bank statements', hint: 'Upload PDF / Excel', path: '/app/bank-statements', icon: Banknote, keywords: 'bank upload' },
  { id: 'bank-reconcile', label: 'Bank match', hint: 'Allocate payments', path: '/app/bank-reconcile', icon: Network, keywords: 'payment allocate' },
  { id: 'tally-converter', label: 'Tally Converter', hint: 'PDF/Excel → Tally XML', path: '/app/tally-converter', icon: FileOutput, keywords: 'tally export xml register' },
  { id: 'tax', label: 'Tax liability', hint: 'Cash vs ITC estimate', path: '/app/tax-liability', icon: TrendingUp },
  { id: 'clients', label: 'Clients', hint: 'Practice workspaces', path: '/app/clients', icon: Building2, keywords: 'business firms' },
  { id: 'cfo', label: 'Virtual CFO', hint: 'AI desk assistant', path: '/app/cfo', icon: Sparkles },
  { id: 'audit', label: 'Audit logs', hint: 'Activity trail', path: '/app/audit-logs', icon: ShieldAlert },
  { id: 'wallet', label: 'Wallet', hint: 'Credits & packs', path: '/app/wallet', icon: CreditCard, keywords: 'credits topup' },
  { id: 'settings', label: 'Settings', hint: 'Profile & preferences', path: '/app/settings', icon: Settings },
];

/**
 * Lightweight Cmd/Ctrl+K palette — no extra deps.
 * Mount inside authenticated `/app/*` Layout.
 */
export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => {
      const hay = `${c.label} ${c.hint} ${c.keywords ?? ''} ${c.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-palette-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const runCommand = useCallback((item: PaletteItem) => {
    close();
    navigate(item.path);
  }, [close, navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        runCommand(filtered[activeIndex]);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('khatalens:open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('khatalens:open-palette', onOpen);
    };
  }, [open, filtered, activeIndex, close, runCommand]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 bg-bg-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={close}
    >
      <div
        className="w-full max-w-lg bg-bg-surface border border-border rounded-xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-text-disabled shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to Scan, Invoices, GSTR-2B…"
            className="flex-1 h-12 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-disabled"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
          />
          <kbd className="hidden sm:inline text-[10px] font-mono text-text-disabled border border-border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          className="max-h-80 overflow-y-auto p-1.5 custom-scrollbar"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-text-secondary">No matching routes</div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-palette-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(item)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    active ? 'bg-accent-subtle text-accent' : 'text-text-primary hover:bg-bg-sunken'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-accent' : 'text-text-secondary')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{item.label}</div>
                    <div className={cn('text-xs truncate', active ? 'text-accent/80' : 'text-text-secondary')}>
                      {item.hint}
                    </div>
                  </div>
                  {active && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />}
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-border bg-bg-sunken/40 flex items-center gap-3 text-[10px] text-text-disabled font-mono uppercase tracking-wider">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="ml-auto">Ctrl/⌘ K</span>
        </div>
      </div>
    </div>
  );
}
