import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, FileText, Settings, LogOut, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Scan Invoices', path: '/scan', icon: ScanLine },
    { name: 'Saved Invoices', path: '/invoices', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-surface border-r border-white/5 flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-white">PayForce</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-textMuted hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-1">
          <button className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-textMuted hover:bg-white/5 hover:text-white transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
