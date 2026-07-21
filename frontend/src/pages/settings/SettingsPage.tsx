import { Loader2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useSettings } from './useSettings';
import { SettingsNav } from './SettingsNav';
import { ProfileTab } from './ProfileTab';
import { CompanyTab } from './CompanyTab';
import { TeamTab } from './TeamTab';
import { AutomationTab } from './AutomationTab';
import { ExportTab } from './ExportTab';
import { SecurityTab } from './SecurityTab';

export default function SettingsPage() {
  const s = useSettings();

  if (s.loading) {
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
        <SettingsNav
          activeTab={s.activeTab}
          onTabChange={s.setActiveTab}
          onSignOut={s.handleSignOut}
        />

        <div className="md:col-span-2">
          <AnimatePresence mode="wait">
            {s.activeTab === 'profile' && (
              <ProfileTab
                user={s.user}
                whatsappNumber={s.whatsappNumber}
                setWhatsappNumber={s.setWhatsappNumber}
                activeWhatsappClientId={s.activeWhatsappClientId}
                setActiveWhatsappClientId={s.setActiveWhatsappClientId}
                clients={s.clients}
                saving={s.saving}
                onSubmit={s.handleSaveProfile}
              />
            )}
            {s.activeTab === 'company' && (
              <CompanyTab
                companyName={s.companyName}
                setCompanyName={s.setCompanyName}
                gstin={s.gstin}
                setGstin={s.setGstin}
                tallyLedgers={s.tallyLedgers}
                setTallyLedgers={s.setTallyLedgers}
                makerCheckerEnabled={s.makerCheckerEnabled}
                setMakerCheckerEnabled={s.setMakerCheckerEnabled}
                userRole={s.userRole}
                saving={s.saving}
                onSubmit={s.handleSaveProfile}
              />
            )}
            {s.activeTab === 'team' && (
              <TeamTab
                userRole={s.userRole}
                joinCode={s.joinCode}
                teamMembers={s.teamMembers}
                inputJoinCode={s.inputJoinCode}
                setInputJoinCode={s.setInputJoinCode}
                joiningFirm={s.joiningFirm}
                copiedCode={s.copiedCode}
                setCopiedCode={s.setCopiedCode}
                onJoinFirm={s.handleJoinFirm}
              />
            )}
            {s.activeTab === 'automation' && (
              <AutomationTab
                activeClientId={s.activeClientId}
                fetchingAutomation={s.fetchingAutomation}
                autoApprove={s.autoApprove}
                setAutoApprove={s.setAutoApprove}
                runTime={s.runTime}
                setRunTime={s.setRunTime}
                saving={s.saving}
                onSubmit={s.handleSaveAutomation}
              />
            )}
            {s.activeTab === 'export' && (
              <ExportTab
                exportColumns={s.exportColumns}
                setExportColumns={s.setExportColumns}
                exportIncludeItems={s.exportIncludeItems}
                setExportIncludeItems={s.setExportIncludeItems}
                saving={s.saving}
                onSubmit={s.handleSaveExport}
              />
            )}
            {s.activeTab === 'security' && (
              <SecurityTab
                user={s.user}
                newPassword={s.newPassword}
                setNewPassword={s.setNewPassword}
                confirmPassword={s.confirmPassword}
                setConfirmPassword={s.setConfirmPassword}
                showNewPw={s.showNewPw}
                setShowNewPw={s.setShowNewPw}
                showConfirmPw={s.showConfirmPw}
                setShowConfirmPw={s.setShowConfirmPw}
                changingPassword={s.changingPassword}
                pwError={s.pwError}
                setPwError={s.setPwError}
                onChangePassword={s.handleChangePassword}
                onSignOut={s.handleSignOut}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
