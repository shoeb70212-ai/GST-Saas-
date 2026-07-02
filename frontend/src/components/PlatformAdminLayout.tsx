import { Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, ShieldAlert, Activity, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';

export default function PlatformAdminLayout() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-indigo-900 border-b border-indigo-800 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-indigo-400" />
              <span className="font-bold text-xl tracking-tight hidden sm:block">Payforce Admin</span>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden sm:flex items-center gap-6">
              <div className="flex items-center gap-2 text-indigo-200">
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Status: All Systems Normal</span>
              </div>
              <div className="w-px h-6 bg-indigo-800"></div>
              <div className="text-sm font-medium">{session?.user?.email}</div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-100 hover:text-white hover:bg-indigo-800 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="sm:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-indigo-200 hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-indigo-900 border-b border-indigo-800 text-white">
          <div className="px-4 pt-2 pb-4 space-y-1">
             <div className="px-3 py-2 text-sm text-indigo-200">{session?.user?.email}</div>
             <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-100 hover:text-white hover:bg-indigo-800 rounded-md"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      
    </div>
  );
}
