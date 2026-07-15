import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut, User, Building2, Shield, Loader2, Save, Lock, Eye, EyeOff, MessageCircle, Zap, Network, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useClient } from '../lib/ClientContext';

type SettingsTab = 'profile' | 'company' | 'automation' | 'security';

const tabSlide = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { activeClientId } = useClient();

  // Profile & Company fields
  const [companyName, setCompanyName] = useState('My Company Ltd.');
  const [gstin, setGstin] = useState('');
  const [tallyLedgers, setTallyLedgers] = useState('');
  const [makerCheckerEnabled, setMakerCheckerEnabled] = useState(false);

  // WhatsApp fields
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [activeWhatsappClientId, setActiveWhatsappClientId] = useState('');
  const [clients, setClients] = useState<any[]>([]);

  // Security / password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Automation fields
  const [autoApprove, setAutoApprove] = useState(false);
  const [runTime, setRunTime] = useState('02:00');
  const [fetchingAutomation, setFetchingAutomation] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (activeClientId) {
      fetchAutomationSettings();
    }
  }, [activeClientId]);

  const fetchAutomationSettings = async () => {
    try {
      setFetchingAutomation(true);
      const { data, error } = await supabase
        .from('clients')
        .select('auto_approve_exact_matches, reconciliation_run_time')
        .eq('id', activeClientId)
        .single();
      if (!error && data) {
        setAutoApprove(!!data.auto_approve_exact_matches);
        if (data.reconciliation_run_time) {
          // run_time is stored as TIME (e.g. '02:00:00'), format it to 'HH:MM'
          setRunTime(data.reconciliation_run_time.substring(0, 5));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingAutomation(false);
    }
  };

  const fetchUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_name, default_gstin, tally_ledgers, maker_checker_enabled, whatsapp_number, active_whatsapp_client_id')
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
          if (profile.whatsapp_number) setWhatsappNumber(profile.whatsapp_number);
          if (profile.active_whatsapp_client_id) setActiveWhatsappClientId(profile.active_whatsapp_client_id);
        }

        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, client_name')
          .eq('user_id', session.user.id);
        if (clientsData) {
          setClients(clientsData);
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
        maker_checker_enabled: makerCheckerEnabled,
        whatsapp_number: whatsappNumber || null,
        active_whatsapp_client_id: activeWhatsappClientId || null
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to update profile.');
    } else {
      toast.success('Profile saved successfully!');
    }
  };

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClientId) {
      toast.error('Please select a client first.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        auto_approve_exact_matches: autoApprove,
        reconciliation_run_time: runTime
      })
      .eq('id', activeClientId);
    setSaving(false);
    if (error) {
      toast.error('Failed to save automation settings.');
    } else {
      toast.success('Automation settings saved successfully!');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);

    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      setPwError(error.message || 'Failed to change password. Please try again.');
    } else {
      toast.success('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const tabs: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
    { key: 'profile', label: 'Profile details', icon: User },
    { key: 'company', label: 'Company defaults', icon: Building2 },
    { key: 'automation', label: 'Automation', icon: Zap },
    { key: 'security', label: 'Security', icon: Shield },
  ];

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary mb-2">Account Settings</h1>
        <p className="text-text-secondary">Manage your profile, company details, and security preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* ── Sidebar Nav ── */}
        <nav className="space-y-1" aria-label="Settings navigation">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer text-left ${
                  isActive
                    ? 'bg-bg-sunken border border-border text-text-primary shadow-sm'
                    : 'text-text-secondary hover:bg-bg-sunken hover:text-text-primary'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : ''}`} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}

          <div className="pt-4 border-t border-border mt-4">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-error hover:bg-error-subtle transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </nav>

        {/* ── Main Panel ── */}
        <div className="md:col-span-2">
          <AnimatePresence mode="wait">

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <motion.form
                key="profile"
                variants={tabSlide}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleSaveProfile}
                className="card p-6 space-y-5"
              >
                <h2 className="text-lg font-display font-semibold text-text-primary">Profile Details</h2>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="input-field w-full opacity-60 cursor-not-allowed bg-bg-sunken"
                  />
                  <p className="text-xs text-text-secondary mt-1">Your email cannot be changed here.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Display Name</label>
                  <input
                    type="text"
                    disabled
                    value={user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''}
                    className="input-field w-full opacity-60 cursor-not-allowed bg-bg-sunken"
                    placeholder="Set via company details"
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-md font-display font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-accent" /> WhatsApp Integration
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">WhatsApp Number</label>
                      <input
                        type="text"
                        value={whatsappNumber}
                        onChange={e => setWhatsappNumber(e.target.value)}
                        className="input-field w-full"
                        placeholder="e.g. +919876543210"
                      />
                      <p className="text-xs text-text-secondary mt-1">Include country code (e.g. +91). This number will be used to identify your uploaded invoices.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Default Client for WhatsApp Uploads</label>
                      <select
                        value={activeWhatsappClientId}
                        onChange={e => setActiveWhatsappClientId(e.target.value)}
                        className="input-field w-full cursor-pointer"
                      >
                        <option value="">-- Select a Client --</option>
                        {clients.map(client => (
                          <option key={client.id} value={client.id}>{client.client_name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-text-secondary mt-1">Invoices forwarded via WhatsApp will be assigned to this client.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end border-t border-border">
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              </motion.form>
            )}

            {/* ── COMPANY TAB ── */}
            {activeTab === 'company' && (
              <motion.form
                key="company"
                variants={tabSlide}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleSaveProfile}
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
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              </motion.form>
            )}

            {/* ── AUTOMATION TAB ── */}
            {activeTab === 'automation' && (
              <motion.form
                key="automation"
                variants={tabSlide}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleSaveAutomation}
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
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                variants={tabSlide}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-6"
              >
                {/* Password Change */}
                <form onSubmit={handleChangePassword} className="card p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-display font-semibold text-text-primary">Change Password</h2>
                    <p className="text-sm text-text-secondary mt-1 font-light">Set a new password for your account. Minimum 8 characters.</p>
                  </div>

                  <div>
                    <label htmlFor="new-password-settings" className="block text-sm font-medium text-text-primary mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                      <input
                        id="new-password-settings"
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setPwError(null); }}
                        className="input-field w-full !pl-10 !pr-10"
                        placeholder="Min. 8 characters"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-secondary transition-colors"
                        aria-label={showNewPw ? 'Hide password' : 'Show password'}
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {newPassword.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4].map(level => {
                          const strength = Math.min(4, Math.floor(newPassword.length / 3));
                          const colors: Record<number, string> = { 1: 'bg-error', 2: 'bg-warning', 3: 'bg-warning', 4: 'bg-accent' };
                          return (
                            <div
                              key={level}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${level <= strength ? colors[strength] : 'bg-border'}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirm-password-settings" className="block text-sm font-medium text-text-primary mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled pointer-events-none" aria-hidden="true" />
                      <input
                        id="confirm-password-settings"
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setPwError(null); }}
                        className={`input-field w-full !pl-10 !pr-10 ${
                          confirmPassword && confirmPassword !== newPassword ? '!border-error/50' : ''
                        }`}
                        placeholder="Repeat your new password"
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-secondary transition-colors"
                        aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-xs text-error mt-1">Passwords do not match.</p>
                    )}
                  </div>

                  {pwError && (
                    <p role="alert" className="text-sm text-center py-2.5 px-4 rounded-lg bg-error-subtle border border-error/20 text-error">
                      {pwError}
                    </p>
                  )}

                  <div className="pt-4 flex justify-end border-t border-border">
                    <button
                      type="submit"
                      disabled={changingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                      className="btn-primary"
                      id="settings-change-password-btn"
                    >
                      {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Update Password
                    </button>
                  </div>
                </form>

                {/* Session / Account Info */}
                <div className="card p-6 space-y-4">
                  <h2 className="text-lg font-display font-semibold text-text-primary">Account Information</h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-text-secondary">Email</span>
                      <span className="text-text-primary font-mono text-xs">{user?.email}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-text-secondary">User ID</span>
                      <span className="text-text-primary font-mono text-xs truncate max-w-[200px]">{user?.id}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-text-secondary">Account Created</span>
                      <span className="text-text-primary text-xs">
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-text-secondary">Last Sign In</span>
                      <span className="text-text-primary text-xs">
                        {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="card p-6 border border-error/20 bg-error-subtle/20 space-y-4">
                  <h2 className="text-lg font-display font-semibold text-error">Danger Zone</h2>
                  <p className="text-sm text-text-secondary">Sign out of your account on this device.</p>
                  <button
                    onClick={handleSignOut}
                    className="px-6 py-2.5 bg-error-subtle hover:bg-error/20 text-error border border-error/20 rounded-xl font-medium flex items-center gap-2 transition-colors text-sm cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
