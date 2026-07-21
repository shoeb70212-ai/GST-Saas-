import { LogOut, User, Building2, Shield, Zap, Users, Table2 } from 'lucide-react';
import type { SettingsTab } from './types';
import type { ElementType } from 'react';

const tabs: { key: SettingsTab; label: string; icon: ElementType }[] = [
  { key: 'profile', label: 'Profile details', icon: User },
  { key: 'company', label: 'Company defaults', icon: Building2 },
  { key: 'team', label: 'Team Management', icon: Users },
  { key: 'automation', label: 'Automation', icon: Zap },
  { key: 'export', label: 'Export Defaults', icon: Table2 },
  { key: 'security', label: 'Security', icon: Shield },
];

type SettingsNavProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onSignOut: () => void;
};

export function SettingsNav({ activeTab, onTabChange, onSignOut }: SettingsNavProps) {
  return (
    <nav className="space-y-1" aria-label="Settings navigation">
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
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
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-error hover:bg-error-subtle transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </nav>
  );
}
