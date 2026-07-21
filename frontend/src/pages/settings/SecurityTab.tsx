import { Loader2, Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { tabSlide } from './types';

type SecurityTabProps = {
  user: Record<string, unknown> | null;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showNewPw: boolean;
  setShowNewPw: (v: boolean | ((prev: boolean) => boolean)) => void;
  showConfirmPw: boolean;
  setShowConfirmPw: (v: boolean | ((prev: boolean) => boolean)) => void;
  changingPassword: boolean;
  pwError: string | null;
  setPwError: (v: string | null) => void;
  onChangePassword: (e: React.FormEvent) => void;
  onSignOut: () => void;
};

export function SecurityTab({
  user,
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
  onChangePassword,
  onSignOut,
}: SecurityTabProps) {
  return (
    <motion.div
      key="security"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-6"
    >
      <form onSubmit={onChangePassword} className="card p-6 space-y-5">
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

      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold text-text-primary">Account Information</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">Email</span>
            <span className="text-text-primary font-mono text-xs">{user?.email as string}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">User ID</span>
            <span className="text-text-primary font-mono text-xs truncate max-w-[200px]">{user?.id as string}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">Account Created</span>
            <span className="text-text-primary text-xs">
              {user?.created_at ? new Date(user.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-text-secondary">Last Sign In</span>
            <span className="text-text-primary text-xs">
              {user?.last_sign_in_at ? new Date(user.last_sign_in_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="card p-6 border border-error/20 bg-error-subtle/20 space-y-4">
        <h2 className="text-lg font-display font-semibold text-error">Danger Zone</h2>
        <p className="text-sm text-text-secondary">Sign out of your account on this device.</p>
        <button
          onClick={onSignOut}
          className="px-6 py-2.5 bg-error-subtle hover:bg-error/20 text-error border border-error/20 rounded-xl font-medium flex items-center gap-2 transition-colors text-sm cursor-pointer"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </motion.div>
  );
}
