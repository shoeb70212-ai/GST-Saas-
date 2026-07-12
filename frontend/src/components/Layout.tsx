import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileText, Settings, LogOut, Sparkles, Menu, X, Sun, Moon, Building2, ChevronDown, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClient } from '../lib/ClientContext';

export default function Layout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
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
    { name: 'Scan Invoices', path: '/scan', icon: ScanLine },
    { name: 'Saved Invoices', path: '/invoices', icon: FileText },
    { name: 'GSTR-2B Recon', path: '/reconcile', icon: FileText },
    { name: isBusiness ? 'Businesses' : 'Clients', path: '/clients', icon: Building2 },
    { name: 'Wallet & Billing', path: '/wallet', icon: CreditCard },
  ];

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden flex-col md:flex-row">
      
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-bg-surface border-b border-border z-50">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="KhataLens Logo" className="w-8 h-8 drop-shadow-sm" />
          <span className="text-lg font-bold text-text-primary">KhataLens</span>
        </div>
        <div className="flex items-center gap-3">
          {credits !== null && (
            <div className="flex px-2 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full border border-accent/20 items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {credits}
            </div>
          )}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-text-secondary hover:text-text-primary transition-colors">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-bg-overlay/50 z-40 md:hidden backdrop-blur-sm" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-50 w-[220px] bg-bg-surface border-r border-border flex flex-col transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-5 border-b border-border hidden md:flex items-center gap-3 h-[60px]">
          <img src="/favicon.png" alt="KhataLens Logo" className="w-8 h-8 drop-shadow-sm" />
          <span className="text-lg font-bold text-text-primary tracking-tight">KhataLens</span>
        </div>
        
        {/* Client Switcher */}
        <div className="p-3 border-b border-border relative">
          <button 
            onClick={() => setClientMenuOpen(!clientMenuOpen)}
            className="w-full flex items-center justify-between p-2 rounded-md hover:bg-bg-sunken transition-colors border border-transparent hover:border-border"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Building2 className="w-4 h-4 text-accent shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">
                {activeClientId 
                  ? clients.find((c: any) => c.id === activeClientId)?.client_name || `Select ${isBusiness ? 'Business' : 'Client'}`
                  : `Select ${isBusiness ? 'Business' : 'Client'}`}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
          </button>

          <AnimatePresence>
            {clientMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-3 right-3 top-[calc(100%+4px)] bg-bg-surface border border-border rounded-lg shadow-xl z-[60] overflow-hidden"
              >
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {clients.length === 0 ? (
                    <div className="p-3 text-xs text-text-secondary text-center">No {isBusiness ? 'businesses' : 'clients'} found</div>
                  ) : (
                    clients.map((client: any) => (
                      <button
                        key={client.id}
                        onClick={() => {
                          setActiveClientId(client.id);
                          setClientMenuOpen(false);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          activeClientId === client.id ? 'bg-accent/10 text-accent font-medium' : 'text-text-primary hover:bg-bg-sunken'
                        }`}
                      >
                        {client.client_name}
                      </button>
                    ))
                  )}
                </div>
                <div className="p-1 border-t border-border">
                  <Link 
                    to="/clients" 
                    onClick={() => { setClientMenuOpen(false); setMobileMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-md transition-colors flex items-center gap-2"
                  >
                    <Settings className="w-3 h-3" /> Manage {isBusiness ? 'Businesses' : 'Clients'}
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-accent-subtle text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-sunken hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link 
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              location.pathname === '/settings' 
                ? 'bg-accent-subtle text-accent font-medium' 
                : 'text-text-secondary hover:bg-bg-sunken hover:text-text-primary'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-sunken hover:text-text-primary transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Desktop Topbar */}
        <div className="hidden md:flex h-[60px] items-center justify-between px-6 bg-bg-surface border-b border-border z-40">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-text-primary capitalize">
              {location.pathname.replace('/', '') || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {credits !== null && (
              <div className="hidden sm:flex px-3 py-1 bg-accent/10 text-accent text-sm font-medium rounded-full border border-accent/20 items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {credits} Credits
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded-md transition-colors"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="w-8 h-8 rounded-full bg-accent-subtle border border-accent/20 flex items-center justify-center text-accent font-medium text-sm">
              LL
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
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
    </div>
  );
}
