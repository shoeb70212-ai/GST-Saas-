import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut, User, Building2, Shield, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('My Company Ltd.');
  const [gstin, setGstin] = useState('');
  const [tallyLedgers, setTallyLedgers] = useState('');
  const [makerCheckerEnabled, setMakerCheckerEnabled] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_name, default_gstin, tally_ledgers, maker_checker_enabled')
          .eq('id', session.user.id)
          .single();
          
        if (profile) {
          if (profile.company_name) setCompanyName(profile.company_name);
          if (profile.default_gstin) setGstin(profile.default_gstin);
          if (profile.tally_ledgers && Array.isArray(profile.tally_ledgers)) {
            setTallyLedgers(profile.tally_ledgers.join(', '));
          }
          if (profile.maker_checker_enabled !== undefined) {
            setMakerCheckerEnabled(profile.maker_checker_enabled);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({
        company_name: companyName,
        default_gstin: gstin,
        tally_ledgers: tallyLedgers.split(',').map(s => s.trim()).filter(Boolean),
        maker_checker_enabled: makerCheckerEnabled
      })
      .eq('id', user.id);
      
    setSaving(false);
    
    if (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile.');
    } else {
      toast.success('Profile updated successfully!');
    }
  };

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">Account Settings</h1>
        <p className="text-text-secondary">Manage your profile, company details, and preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Nav */}
        <div className="space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-md bg-bg-sunken border border-border text-text-primary font-medium">
            <User className="w-4 h-4 text-accent" />
            Profile details
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-text-secondary hover:bg-bg-sunken hover:text-text-primary transition-colors">
            <Building2 className="w-4 h-4" />
            Company defaults
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-text-secondary hover:bg-bg-sunken hover:text-text-primary transition-colors">
            <Shield className="w-4 h-4" />
            Security
          </button>
        </div>

        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSaveProfile} className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-text-primary">Profile Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Email Address</label>
                <input 
                  type="email" 
                  disabled 
                  value={user?.email || ''} 
                  className="input-field w-full opacity-60 cursor-not-allowed bg-bg-sunken"
                />
                <p className="text-xs text-text-secondary mt-1">Your email address cannot be changed.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Company Name</label>
                <input 
                  type="text" 
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Default GSTIN</label>
                <input 
                  type="text" 
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AADCB2230M1Z2"
                  className="input-field w-full uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Custom Tally Ledgers</label>
                <textarea 
                  value={tallyLedgers}
                  onChange={(e) => setTallyLedgers(e.target.value)}
                  placeholder="Printing & Stationery, Legal Fees, CGST Payable, SGST Payable"
                  className="input-field w-full min-h-[80px] resize-y"
                />
                <p className="text-xs text-text-secondary mt-1">Comma separated list of your standard accounting ledgers. The AI will strictly map expenses to these categories.</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-bg-sunken rounded-lg border border-border">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Maker-Checker Workflow</h3>
                  <p className="text-xs text-text-secondary mt-1">Require manual approval of AI extracted invoices before CAs can export them to Tally.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={makerCheckerEnabled}
                    onChange={(e) => setMakerCheckerEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-border mt-6">
              <button 
                type="submit"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </form>

          <div className="card p-6 border-error-subtle bg-error-subtle/30 space-y-4">
            <h2 className="text-lg font-semibold text-error">Danger Zone</h2>
            <p className="text-sm text-text-secondary">Log out of your account on this device.</p>
            <button 
              onClick={handleSignOut}
              className="px-6 py-2 bg-error-subtle hover:bg-error/20 text-error border border-error/20 rounded-md font-medium flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
