import { Loader2, Save, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { tabSlide } from './types';

type ProfileTabProps = {
  user: Record<string, unknown> | null;
  whatsappNumber: string;
  setWhatsappNumber: (v: string) => void;
  activeWhatsappClientId: string;
  setActiveWhatsappClientId: (v: string) => void;
  clients: { id: string; client_name: string }[];
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function ProfileTab({
  user,
  whatsappNumber,
  setWhatsappNumber,
  activeWhatsappClientId,
  setActiveWhatsappClientId,
  clients,
  saving,
  onSubmit,
}: ProfileTabProps) {
  const metadata = user?.user_metadata as { full_name?: string } | undefined;
  const email = (user?.email as string) || '';

  return (
    <motion.form
      key="profile"
      variants={tabSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      onSubmit={onSubmit}
      className="card p-6 space-y-5"
    >
      <h2 className="text-lg font-display font-semibold text-text-primary">Profile Details</h2>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">Email Address</label>
        <input
          type="email"
          disabled
          value={email}
          className="input-field w-full opacity-60 cursor-not-allowed bg-bg-sunken"
        />
        <p className="text-xs text-text-secondary mt-1">Your email cannot be changed here.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1.5">Display Name</label>
        <input
          type="text"
          disabled
          value={metadata?.full_name || email.split('@')[0] || ''}
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
  );
}
