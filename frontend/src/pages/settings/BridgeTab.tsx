import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Trash2, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { tabSlide } from './types';

type Device = {
  id: string;
  label: string;
  last_seen_at?: string | null;
  revoked_at?: string | null;
  created_at?: string;
  client_id_allowlist?: string[] | null;
};

const BRIDGE_DOWNLOAD_URL =
  import.meta.env.VITE_BRIDGE_DOWNLOAD_URL ||
  'https://github.com/shoeb70212-ai/GST-Saas-/releases';

export function BridgeTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [label, setLabel] = useState('Office PC');
  const [newSecret, setNewSecret] = useState<{ device_id: string; device_secret: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const res = await fetch(`${getApiUrl()}/api/bridge/devices`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load devices');
      const json = await res.json();
      setDevices(json.devices || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async () => {
    setRegistering(true);
    setNewSecret(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const res = await fetch(`${getApiUrl()}/api/bridge/devices/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Register failed');
      }
      const json = await res.json();
      setNewSecret({ device_id: json.device_id, device_secret: json.device_secret });
      toast.success('Device registered — copy the secret now');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Register failed');
    } finally {
      setRegistering(false);
    }
  };

  const revoke = async (deviceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Auth required');
      const res = await fetch(`${getApiUrl()}/api/bridge/devices/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_id: deviceId }),
      });
      if (!res.ok) throw new Error('Revoke failed');
      toast.success('Device revoked');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed');
    }
  };

  return (
    <motion.div key="bridge" variants={tabSlide} initial="hidden" animate="visible" exit="exit" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-accent" /> Tally Bridge
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Install the Windows bridge on a PC with TallyPrime. Register a device here, paste ID + secret into the bridge, then use Push to Tally from Invoices / Converter.
        </p>
      </div>

      <a
        href={BRIDGE_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className="btn-primary inline-flex items-center gap-2"
      >
        Download Windows Bridge
      </a>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-text-secondary">Device label</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-bg-surface"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={register} disabled={registering}>
          {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Register device
        </button>
      </div>

      {newSecret && (
        <div className="p-4 rounded-xl border border-accent/40 bg-bg-sunken space-y-2 text-sm">
          <p className="font-medium text-text-primary">Copy once — secret will not be shown again</p>
          <p className="font-mono break-all">ID: {newSecret.device_id}</p>
          <p className="font-mono break-all">Secret: {newSecret.device_secret}</p>
          <button
            type="button"
            className="btn-ghost flex items-center gap-1"
            onClick={() => {
              void navigator.clipboard.writeText(
                `device_id=${newSecret.device_id}\ndevice_secret=${newSecret.device_secret}`,
              );
              toast.success('Copied');
            }}
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
        </div>
      )}

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      ) : (
        <ul className="space-y-2">
          {devices.length === 0 && (
            <li className="text-sm text-text-secondary">No devices yet.</li>
          )}
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-bg-surface"
            >
              <div>
                <p className="font-medium text-text-primary">
                  {d.label}{' '}
                  {d.revoked_at ? (
                    <span className="text-xs text-error">(revoked)</span>
                  ) : (
                    <span className="text-xs text-success">(active)</span>
                  )}
                </p>
                <p className="text-xs text-text-secondary font-mono">{d.id}</p>
                <p className="text-xs text-text-secondary">
                  Last seen: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'never'}
                </p>
              </div>
              {!d.revoked_at && (
                <button
                  type="button"
                  className="btn-ghost text-error"
                  onClick={() => revoke(d.id)}
                  aria-label={`Revoke ${d.label}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
