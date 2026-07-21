import { Loader2, Shield, UserPlus, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { tabSlide } from './types';

type TeamMember = { user_id: string; role: string };

type TeamTabProps = {
  userRole: string;
  joinCode: string | null;
  teamMembers: TeamMember[];
  inputJoinCode: string;
  setInputJoinCode: (v: string) => void;
  joiningFirm: boolean;
  copiedCode: boolean;
  setCopiedCode: (v: boolean) => void;
  onJoinFirm: (e: React.FormEvent) => void;
};

export function TeamTab({
  userRole,
  joinCode,
  teamMembers,
  inputJoinCode,
  setInputJoinCode,
  joiningFirm,
  copiedCode,
  setCopiedCode,
  onJoinFirm,
}: TeamTabProps) {
  return (
    <motion.div
      key="team"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-6"
    >
      {(userRole === 'owner' || userRole === 'admin') ? (
        <>
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold text-text-primary">Invite Team Members</h2>
                <p className="text-sm text-text-secondary font-light">Share this code with junior accountants to invite them to your firm.</p>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-4 p-4 bg-bg-sunken border border-border rounded-xl">
              <code className="text-2xl font-mono font-bold tracking-widest text-accent flex-1 text-center py-2">
                {joinCode || 'Loading...'}
              </code>
              <button
                onClick={() => {
                  if (joinCode) {
                    navigator.clipboard.writeText(joinCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                    toast.success('Join code copied!');
                  }
                }}
                className="btn-secondary h-12"
              >
                {copiedCode ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                Copy
              </button>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-display font-semibold text-text-primary mb-4">Team Roster</h2>
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-bg-sunken border-b border-border text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-medium">User ID</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teamMembers.map((member, idx) => (
                    <tr key={idx} className="hover:bg-bg-sunken/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{member.user_id}</td>
                      <td className="px-4 py-3 capitalize">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${member.role === 'owner' ? 'bg-accent/10 text-accent' : 'bg-border text-text-secondary'}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.role !== 'owner' && (
                          <button className="text-error hover:text-error-hover text-xs font-medium">
                            Revoke Access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card p-6 text-center">
          <Shield className="w-12 h-12 text-border mx-auto mb-4" />
          <h2 className="text-lg font-display font-semibold text-text-primary">Restricted Access</h2>
          <p className="text-sm text-text-secondary mt-1">Only Firm Owners and Admins can manage the team roster.</p>
        </div>
      )}

      <form onSubmit={onJoinFirm} className="card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold text-text-primary">Join an Existing Firm</h2>
        <p className="text-sm text-text-secondary font-light">Enter an invite code provided by your CA Firm Admin to switch your workspace context.</p>

        <div className="flex gap-4">
          <input
            type="text"
            value={inputJoinCode}
            onChange={e => setInputJoinCode(e.target.value)}
            placeholder="e.g. KHATA-1234"
            className="input-field uppercase font-mono flex-1"
            required
          />
          <button type="submit" disabled={joiningFirm || !inputJoinCode} className="btn-primary w-32">
            {joiningFirm ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join Firm'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
