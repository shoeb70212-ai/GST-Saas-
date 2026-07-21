import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useClient } from '../../lib/ClientContext';
import { DEFAULT_COLUMNS } from '../../lib/constants';
import type { SettingsTab } from './types';

export function useSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { activeClientId, refreshCredits, setActiveOrgId, activeOrgId } = useClient();

  const [companyName, setCompanyName] = useState('My Company Ltd.');
  const [gstin, setGstin] = useState('');
  const [tallyLedgers, setTallyLedgers] = useState('');
  const [makerCheckerEnabled, setMakerCheckerEnabled] = useState(false);

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [activeWhatsappClientId, setActiveWhatsappClientId] = useState('');
  const [clients, setClients] = useState<{ id: string; client_name: string }[]>([]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [autoApprove, setAutoApprove] = useState(false);
  const [runTime, setRunTime] = useState('02:00');
  const [fetchingAutomation, setFetchingAutomation] = useState(false);

  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; role: string; profiles?: { company_name?: string } }>>([]);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('owner');
  const [inputJoinCode, setInputJoinCode] = useState('');
  const [joiningFirm, setJoiningFirm] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [exportColumns, setExportColumns] = useState<Set<string>>(new Set(DEFAULT_COLUMNS));
  const [exportIncludeItems, setExportIncludeItems] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchAutomationSettings = useCallback(async () => {
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
          setRunTime(data.reconciliation_run_time.substring(0, 5));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingAutomation(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    if (activeClientId) {
      fetchAutomationSettings();
    }
  }, [activeClientId, fetchAutomationSettings]);

  const fetchUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user as unknown as Record<string, unknown>);
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_name, default_gstin, tally_ledgers, maker_checker_enabled, whatsapp_number, active_whatsapp_client_id, export_columns, export_include_items')
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

          if (profile.export_columns) {
            setExportColumns(new Set(profile.export_columns));
          }
          if (profile.export_include_items !== undefined) {
            setExportIncludeItems(profile.export_include_items);
          }
        }

        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, client_name')
          .order('created_at', { ascending: false });
        if (clientsData) {
          setClients(clientsData);
        }

        const { data: orgData } = await supabase.rpc('get_user_orgs');
        if (orgData && orgData.length > 0) {
          const preferred =
            (activeOrgId && orgData.find((o: { org_id: string }) => o.org_id === activeOrgId)) ||
            orgData[0];
          setUserRole(preferred.role);

          if (preferred.role === 'owner' || preferred.role === 'admin') {
            const { data: orgDetails } = await supabase
              .from('organizations')
              .select('join_code')
              .eq('id', preferred.org_id)
              .single();
            if (orgDetails) setJoinCode(orgDetails.join_code);

            const { data: members } = await supabase
              .from('organization_members')
              .select('user_id, role, profiles(company_name)')
              .eq('org_id', preferred.org_id);
            if (members) setTeamMembers(members as typeof teamMembers);
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
        maker_checker_enabled: makerCheckerEnabled,
        whatsapp_number: whatsappNumber || null,
        active_whatsapp_client_id: activeWhatsappClientId || null
      })
      .eq('id', user.id as string);
    setSaving(false);
    if (error) {
      toast.error('Failed to update profile.');
    } else {
      toast.success('Profile saved successfully!');
    }
  };

  const handleSaveExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        export_columns: Array.from(exportColumns),
        export_include_items: exportIncludeItems
      })
      .eq('id', user.id as string);
    setSaving(false);
    if (error) {
      toast.error('Failed to update export preferences.');
    } else {
      toast.success('Export preferences saved successfully!');
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

  const handleJoinFirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputJoinCode) return;
    setJoiningFirm(true);
    const { data: joinedOrgId, error } = await supabase.rpc('join_firm', { join_code_param: inputJoinCode.toUpperCase() });
    setJoiningFirm(false);

    if (error) {
      toast.error(error.message || 'Invalid Join Code');
    } else {
      toast.success('Successfully joined the firm!');
      if (joinedOrgId) {
        await setActiveOrgId(joinedOrgId as string);
      } else {
        await refreshCredits();
      }
      fetchUser();
    }
  };

  return {
    activeTab,
    setActiveTab,
    user,
    loading,
    saving,
    activeClientId,
    companyName,
    setCompanyName,
    gstin,
    setGstin,
    tallyLedgers,
    setTallyLedgers,
    makerCheckerEnabled,
    setMakerCheckerEnabled,
    whatsappNumber,
    setWhatsappNumber,
    activeWhatsappClientId,
    setActiveWhatsappClientId,
    clients,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showNewPw,
    setShowNewPw,
    showConfirmPw,
    setShowConfirmPw,
    changingPassword,
    pwError,
    setPwError,
    autoApprove,
    setAutoApprove,
    runTime,
    setRunTime,
    fetchingAutomation,
    teamMembers,
    joinCode,
    userRole,
    inputJoinCode,
    setInputJoinCode,
    joiningFirm,
    copiedCode,
    setCopiedCode,
    exportColumns,
    setExportColumns,
    exportIncludeItems,
    setExportIncludeItems,
    handleSignOut,
    handleSaveProfile,
    handleSaveExport,
    handleSaveAutomation,
    handleChangePassword,
    handleJoinFirm,
  };
}
