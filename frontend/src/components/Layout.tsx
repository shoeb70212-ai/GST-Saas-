import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileText, Settings, LogOut, Sparkles, Sun, Moon, Building2, ChevronDown, CreditCard, MoreHorizontal, TrendingUp, Banknote, Network, ShieldAlert, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClient } from '../lib/ClientContext';
import { cn } from '../lib/utils';
import KhataLensIcon from './KhataLensIcon';

type NavItem = { name: string; path: string; icon: typeof LayoutDashboard };

/**
 * Layout — authenticated app shell.
 * Solid fog surfaces + copper active state (Fog & Copper Seal).
 * Grouped IA for CA desk work.
 */
export default function Layout() {
  const location = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { clients, activeClientId, setActiveClientId, credits, orgs, activeOrgId, setActiveOrgId } = useClient();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const activeOrg = orgs.find((o) => o.org_id === activeOrgId) ?? orgs[0];
  const showOrgSwitcher = orgs.length > 1;

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    return clients.filter((c: { client_name: string; gstin?: string | null }) =>
      c.client_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.gstin && c.gstin.toLowerCase().includes(clientSearch.toLowerCase()))
    );
  }, [clients, clientSearch]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, [location.pathname]);

  const toggleTheme = () => {
    const newTheme = !isDarkMode ? 'dark' : 'light';
    setIsDarkMode(!isDarkMode);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', newTheme);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isBusiness = localStorage.getItem('accountType') === 'business';

  const mobilePrimary: NavItem[] = [
    { name: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
    { name: 'Scan', path: '/app/scan', icon: ScanLine },
    { name: 'Invoices', path: '/app/invoices', icon: FileText },
  ];

  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Today',
      items: [
        { name: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
        { name: 'Scan', path: '/app/scan', icon: ScanLine },
        { name: 'Invoices', path: '/app/invoices', icon: FileText },
      ],
    },
    {
      label: 'Reconcile',
      items: [
        { name: 'GSTR-2B', path: '/app/reconcile', icon: FileText },
        { name: 'Bank Stmts', path: '/app/bank-statements', icon: Banknote },
        { name: 'Bank Match', path: '/app/bank-reconcile', icon: Network },
        { name: 'Tax Liability', path: '/app/tax-liability', icon: TrendingUp },
      ],
    },
    {
      label: 'Practice',
      items: [
        { name: isBusiness ? 'Businesses' : 'Clients', path: '/app/clients', icon: Building2 },
        { name: 'Virtual CFO', path: '/app/cfo', icon: Sparkles },
        { name: 'Audit Logs', path: '/app/audit-logs', icon: ShieldAlert },
      ],
    },
    {
      label: 'Account',
      items: [
        { name: 'Wallet', path: '/app/wallet', icon: CreditCard },
        { name: 'Settings', path: '/app/settings', icon: Settings },
      ],
    },
  ];

  const moreNavItems = navGroups.slice(1).flatMap((g) => g.items);

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group outline-none',
          isActive ? 'text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-sunken/60'
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-accent" aria-hidden="true" />
        )}
        {isActive && (
          <motion.div
            layoutId="active-sidebar-nav"
            className="absolute inset-0 bg-accent-subtle rounded-lg"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <Icon className={cn('w-[17px] h-[17px] relative z-10', isActive ? 'text-accent' : 'text-text-secondary group-hover:text-text-primary')} />
        <span className="relative z-10">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-[100dvh] bg-bg-base overflow-hidden flex-col md:flex-row pb-safe md:pb-0">

      {/* Mobile Top Header */}
      <div className="md:hidden glass-header flex items-center justify-between p-3 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <KhataLensIcon size={28} />
          <span className="text-lg font-display font-semibold text-text-primary tracking-tight">KhataLens</span>
        </div>

        <div className="flex items-center gap-2">
          {credits !== null && (
            <Link to="/app/wallet" className="flex px-2 py-1 bg-accent-subtle text-accent text-xs font-medium rounded-md border border-accent/20 items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {credits}
            </Link>
          )}
          <button onClick={toggleTheme} className="p-1.5 text-text-secondary hover:text-text-primary bg-bg-sunken rounded-md">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar — solid white on fog, no glass */}
      <div className="hidden md:flex inset-y-0 left-0 z-50 w-[260px] flex-col p-3">
        <div className="flex-1 bg-bg-surface border border-border shadow-sm rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-4 flex items-center gap-2.5 border-b border-border">
            <KhataLensIcon size={28} />
            <span className="text-lg font-display font-semibold text-text-primary tracking-tight">KhataLens</span>
          </div>

          <div className="px-3 py-3 relative space-y-2 border-b border-border">
            {showOrgSwitcher && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOrgMenuOpen(!orgMenuOpen);
                    setClientMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-bg-sunken border border-border text-left"
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary shrink-0">Firm</span>
                    <span className="text-xs font-semibold text-text-primary truncate">
                      {activeOrg?.name || 'Select firm'}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                </button>
                <AnimatePresence>
                  {orgMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-[calc(100%+4px)] bg-bg-surface border border-border rounded-xl shadow-lg z-[70] overflow-hidden"
                    >
                      <div className="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
                        {orgs.map((org) => (
                          <button
                            key={org.org_id}
                            type="button"
                            onClick={() => {
                              void setActiveOrgId(org.org_id);
                              setOrgMenuOpen(false);
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                              activeOrgId === org.org_id
                                ? 'bg-accent-subtle text-accent font-semibold'
                                : 'text-text-primary hover:bg-bg-sunken font-medium'
                            )}
                          >
                            <span className="block truncate">{org.name}</span>
                            <span className="text-[10px] text-text-secondary capitalize">{org.role}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setClientSearch('');
                setOrgMenuOpen(false);
                setClientMenuOpen(!clientMenuOpen);
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-bg-sunken border border-border hover:border-border-focus transition-colors"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-6 h-6 rounded-md bg-accent-subtle text-accent flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-semibold text-text-primary truncate">
                  {activeClientId
                    ? clients.find((c: { id: string; client_name: string }) => c.id === activeClientId)?.client_name || `Select ${isBusiness ? 'Business' : 'Client'}`
                    : `Select ${isBusiness ? 'Business' : 'Client'}`}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
            </button>

            <AnimatePresence>
              {clientMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute left-3 right-3 top-[calc(100%+4px)] bg-bg-surface border border-border rounded-xl shadow-lg z-[60] overflow-hidden"
                >
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled" />
                      <input
                        type="text"
                        placeholder={`Search ${isBusiness ? 'businesses' : 'clients'}...`}
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="w-full h-8 pl-9 pr-3 text-sm bg-bg-sunken border border-border rounded-md outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all placeholder:text-text-disabled"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                    {filteredClients.length === 0 ? (
                      <div className="p-3 text-xs text-text-secondary text-center">No results found</div>
                    ) : (
                      filteredClients.map((client: { id: string; client_name: string }) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setActiveClientId(client.id);
                            setClientMenuOpen(false);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                            activeClientId === client.id
                              ? 'bg-accent-subtle text-accent font-semibold'
                              : 'text-text-primary hover:bg-bg-sunken font-medium'
                          )}
                        >
                          {client.client_name}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="p-1.5 border-t border-border bg-bg-sunken/50">
                    <Link
                      to="/app/clients"
                      onClick={() => setClientMenuOpen(false)}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded-md transition-colors flex items-center gap-2"
                    >
                      <Settings className="w-3 h-3" /> Manage {isBusiness ? 'Businesses' : 'Clients'}
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto custom-scrollbar">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map(renderNavLink)}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary bg-bg-sunken border border-border hover:bg-bg-base hover:text-text-primary transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        <div className="hidden md:flex h-[52px] items-center justify-between px-6 bg-bg-surface border-b border-border z-40 sticky top-0">
          <div />
          <div className="flex items-center gap-3">
            <Link to="/app/scan" className="btn-primary !h-8 !text-xs !rounded-lg px-3.5">
              <ScanLine className="w-3.5 h-3.5" /> Quick Scan
            </Link>
            {credits !== null && (
              <Link
                to="/app/wallet"
                className={cn(
                  'flex px-3 py-1.5 text-sm font-semibold rounded-lg border items-center gap-1.5',
                  credits < 50
                    ? 'bg-accent-subtle text-accent border-accent/25'
                    : 'bg-bg-sunken text-text-primary border-border'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-mono">{credits}</span>
                <span className="text-text-secondary font-normal text-xs">credits</span>
              </Link>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-lg transition-colors border border-transparent hover:border-border"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Client Switcher */}
        <div className="md:hidden px-4 py-2 bg-bg-surface border-b border-border flex items-center justify-between z-40">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{isBusiness ? 'Business' : 'Client'}</span>
          <button
            type="button"
            onClick={() => {
              setClientSearch('');
              setClientMenuOpen(!clientMenuOpen);
            }}
            className="flex items-center gap-1 text-sm font-semibold text-accent active:opacity-70"
          >
            {activeClientId
              ? clients.find((c: { id: string; client_name: string }) => c.id === activeClientId)?.client_name || 'Select'
              : 'Select'}
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {clientMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[100] bg-bg-overlay flex items-end justify-center"
              onClick={() => setClientMenuOpen(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full bg-bg-surface rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-4 border-b border-border flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-semibold text-lg">Select {isBusiness ? 'Business' : 'Client'}</h3>
                    <button type="button" onClick={() => setClientMenuOpen(false)} className="p-2 rounded-full bg-bg-sunken text-text-secondary">
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full h-10 pl-10 pr-4 text-sm bg-bg-sunken border border-border rounded-lg outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all placeholder:text-text-disabled"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto p-4 space-y-2 flex-1 pb-8">
                  {filteredClients.length === 0 ? (
                    <div className="p-4 text-center text-text-secondary">No results found</div>
                  ) : (
                    filteredClients.map((client: { id: string; client_name: string }) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setActiveClientId(client.id);
                          setClientMenuOpen(false);
                        }}
                        className={cn(
                          'w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between',
                          activeClientId === client.id
                            ? 'border-accent bg-accent-subtle text-accent shadow-sm'
                            : 'border-border bg-bg-surface text-text-primary active:bg-bg-sunken'
                        )}
                      >
                        <span className="font-semibold">{client.client_name}</span>
                        {activeClientId === client.id && <Sparkles className="w-5 h-5" />}
                      </button>
                    ))
                  )}
                  <Link
                    to="/app/clients"
                    onClick={() => setClientMenuOpen(false)}
                    className="w-full mt-4 flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border text-text-secondary font-medium active:bg-bg-sunken"
                  >
                    <Settings className="w-4 h-4" /> Manage {isBusiness ? 'Businesses' : 'Clients'}
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-auto md:pb-0 pb-16 relative">
          <Outlet />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="bottom-nav">
        {mobilePrimary.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={cn('bottom-nav-item', isActive && 'active')}>
              <Icon className={cn('w-6 h-6', isActive ? 'stroke-[2.5px]' : 'stroke-[2px]')} />
              <span className="text-[10px] font-semibold">{item.name}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
          className={cn('bottom-nav-item', mobileMoreOpen && 'active')}
        >
          <MoreHorizontal className="w-6 h-6 stroke-[2.5px]" />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </div>

      <AnimatePresence>
        {mobileMoreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[40] bg-bg-overlay"
            onClick={() => setMobileMoreOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-[calc(env(safe-area-inset-bottom,16px)+64px)] left-2 right-2 bg-bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
                {moreNavItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMoreOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-xl text-text-primary font-medium hover:bg-bg-sunken active:bg-bg-sunken transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-bg-sunken text-text-secondary flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      {item.name}
                    </Link>
                  );
                })}
                <div className="h-px bg-border my-2 mx-2" />
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-error font-medium hover:bg-error-subtle active:bg-error-subtle transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-error-subtle text-error flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  Sign Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
