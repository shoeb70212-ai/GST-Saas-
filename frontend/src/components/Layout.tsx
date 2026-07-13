import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileText, Settings, LogOut, Sparkles, Sun, Moon, Building2, ChevronDown, CreditCard, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClient } from '../lib/ClientContext';
import { cn } from '../lib/utils';

/**
 * Layout Component
 * 
 * This is the root structural component for all authenticated pages.
 * 
 * Responsibilities:
 * 1. Responsive Navigation: Renders the Desktop Sidebar and the Mobile Bottom Navigation bar.
 * 2. Theming: Manages Light/Dark mode via localStorage and Tailwind's `dark` class.
 * 3. Client Context: Allows the user to switch between different "Clients/Businesses" they manage.
 *    Changing the active client globally affects what invoices/reconciliations are shown in the `<Outlet />`.
 */
export default function Layout() {
  const location = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { clients, activeClientId, setActiveClientId } = useClient();

  useEffect(() => {
    // Check initial theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    const fetchCredits = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', session.user.id)
          .single();
        if (data) {
          setCredits(data.credits);
        }
      }
    };
    fetchCredits();
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
  
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Scan', path: '/scan', icon: ScanLine },
    { name: 'Virtual CFO', path: '/cfo', icon: TrendingUp },
    { name: 'Invoices', path: '/invoices', icon: FileText },
    { name: 'GSTR-2B', path: '/reconcile', icon: FileText },
  ];
  
  const moreNavItems = [
    { name: isBusiness ? 'Businesses' : 'Clients', path: '/clients', icon: Building2 },
    { name: 'Wallet & Billing', path: '/wallet', icon: CreditCard },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-[100dvh] bg-bg-base overflow-hidden flex-col md:flex-row pb-safe md:pb-0">
      
      {/* Mobile Top Header (Sticky) */}
      <div className="md:hidden glass-header flex items-center justify-between p-3 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="KhataLens Logo" className="w-7 h-7 drop-shadow-sm" />
          <span className="text-lg font-bold text-text-primary tracking-tight">KhataLens</span>
        </div>
        
        <div className="flex items-center gap-2">
          {credits !== null && (
            <div className="flex px-2 py-1 bg-accent-subtle text-accent text-xs font-medium rounded-full border border-accent/20 items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {credits}
            </div>
          )}
          <button onClick={toggleTheme} className="p-1.5 text-text-secondary hover:text-text-primary bg-bg-sunken rounded-full">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar (Floating Glass) */}
      <div className="hidden md:flex inset-y-0 left-0 z-50 w-[280px] flex-col p-4">
        <div className="flex-1 bg-bg-surface/60 backdrop-blur-2xl border border-white/10 shadow-xl rounded-2xl flex flex-col overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          <div className="p-5 flex items-center gap-3 h-[70px] relative z-10">
          <img src="/favicon.png" alt="KhataLens Logo" className="w-8 h-8 drop-shadow-sm" />
          <span className="text-xl font-bold text-text-primary tracking-tight">KhataLens</span>
        </div>
        
        {/* Client Switcher (Desktop) */}
        <div className="px-4 pb-4 relative z-10">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setClientMenuOpen(!clientMenuOpen)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-bg-sunken border border-border hover:border-border-focus transition-colors shadow-sm"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded-md bg-accent-subtle text-accent flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-semibold text-text-primary truncate">
                {activeClientId 
                  ? clients.find((c: any) => c.id === activeClientId)?.client_name || `Select ${isBusiness ? 'Business' : 'Client'}`
                  : `Select ${isBusiness ? 'Business' : 'Client'}`}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
          </motion.button>

          <AnimatePresence>
            {clientMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute left-4 right-4 top-[calc(100%+4px)] bg-bg-surface border border-border rounded-xl shadow-lg z-[60] overflow-hidden"
              >
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                  {clients.length === 0 ? (
                    <div className="p-3 text-xs text-text-secondary text-center">No {isBusiness ? 'businesses' : 'clients'} found</div>
                  ) : (
                    clients.map((client: any) => (
                      <button
                        key={client.id}
                        onClick={() => {
                          setActiveClientId(client.id);
                          setClientMenuOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                          activeClientId === client.id 
                            ? "bg-accent-subtle text-accent font-semibold" 
                            : "text-text-primary hover:bg-bg-sunken font-medium"
                        )}
                      >
                        {client.client_name}
                      </button>
                    ))
                  )}
                </div>
                <div className="p-1.5 border-t border-border bg-bg-sunken/50">
                  <Link 
                    to="/clients" 
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

        <div className="px-5 text-[11px] font-bold text-text-secondary uppercase tracking-widest mb-3 mt-4 relative z-10">Menu</div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto relative z-10">
          {[...navItems, ...moreNavItems].map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors group outline-none",
                  isActive ? "text-accent" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-sidebar-nav"
                    className="absolute inset-0 bg-accent-subtle rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
                <Icon className={cn("w-[18px] h-[18px] relative z-10 transition-colors", isActive ? "text-accent" : "text-text-secondary group-hover:text-text-primary")} />
                <span className="relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 relative z-10">
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-bg-sunken border border-border hover:bg-bg-surface hover:text-text-primary transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        
        {/* Desktop Topbar */}
        <div className="hidden md:flex h-[90px] items-center justify-between px-8 bg-transparent z-40 sticky top-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-text-primary capitalize tracking-tight">
              {location.pathname.replace('/', '') || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-5">
            {credits !== null && (
              <div className="flex px-3 py-1.5 bg-accent-subtle text-accent text-sm font-semibold rounded-full border border-accent/20 items-center gap-1.5 shadow-sm">
                <Sparkles className="w-4 h-4" />
                {credits} Credits
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-full transition-colors border border-transparent hover:border-border"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
              ME
            </div>
          </div>
        </div>

        {/* Mobile Client Switcher */}
        <div className="md:hidden px-4 py-2 bg-bg-surface border-b border-border flex items-center justify-between z-40">
           <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{isBusiness ? 'Business' : 'Client'}</span>
           <button 
            onClick={() => setClientMenuOpen(!clientMenuOpen)}
            className="flex items-center gap-1 text-sm font-semibold text-accent active:opacity-70"
          >
            {activeClientId 
              ? clients.find((c: any) => c.id === activeClientId)?.client_name || 'Select'
              : 'Select'}
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Client Switcher Modal */}
        <AnimatePresence>
          {clientMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[100] bg-bg-overlay/60 backdrop-blur-sm flex items-end justify-center"
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
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg">Select {isBusiness ? 'Business' : 'Client'}</h3>
                  <button onClick={() => setClientMenuOpen(false)} className="p-2 rounded-full bg-bg-sunken text-text-secondary">
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-2 flex-1 pb-8">
                  {clients.length === 0 ? (
                    <div className="p-4 text-center text-text-secondary">No {isBusiness ? 'businesses' : 'clients'} found</div>
                  ) : (
                    clients.map((client: any) => (
                      <button
                        key={client.id}
                        onClick={() => {
                          setActiveClientId(client.id);
                          setClientMenuOpen(false);
                        }}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between",
                          activeClientId === client.id 
                            ? "border-accent bg-accent-subtle text-accent shadow-sm" 
                            : "border-border bg-bg-surface text-text-primary active:bg-bg-sunken"
                        )}
                      >
                        <span className="font-semibold">{client.client_name}</span>
                        {activeClientId === client.id && <Sparkles className="w-5 h-5" />}
                      </button>
                    ))
                  )}
                  <Link 
                    to="/clients" 
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
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="bottom-nav">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={cn("bottom-nav-item", isActive && "active")}>
              <Icon className={cn("w-6 h-6", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
              <span className="text-[10px] font-semibold">{item.name}</span>
            </Link>
          );
        })}
        <button 
          onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
          className={cn("bottom-nav-item", mobileMoreOpen && "active")}
        >
          <MoreHorizontal className="w-6 h-6 stroke-[2.5px]" />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </div>

      {/* Mobile 'More' Menu Drawer */}
      <AnimatePresence>
        {mobileMoreOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[40] bg-bg-overlay/60 backdrop-blur-sm"
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
              <div className="p-2 space-y-1">
                {moreNavItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMoreOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-xl text-text-primary font-medium hover:bg-bg-sunken active:bg-bg-sunken transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-accent-subtle text-accent flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      {item.name}
                    </Link>
                  );
                })}
                <div className="h-[1px] bg-border my-2 mx-2" />
                <button
                  onClick={() => {
                    setMobileMoreOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-error font-medium hover:bg-error-subtle active:bg-error-subtle transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-error-subtle text-error flex items-center justify-center">
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
