import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Status = {
  state: string;
  detail?: string;
};

const DEFAULT_API = 'http://localhost:8000';

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [deviceId, setDeviceId] = useState('');
  const [deviceSecret, setDeviceSecret] = useState('');
  const [tallyHost, setTallyHost] = useState('127.0.0.1');
  const [tallyPort, setTallyPort] = useState('9000');
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [polling, setPolling] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  }, []);

  const saveAndStart = useCallback(async () => {
    setStatus({ state: 'starting' });
    try {
      if (isTauri) {
        await invoke('save_config', {
          config: {
            api_base: apiBase.replace(/\/$/, ''),
            device_id: deviceId,
            device_secret: deviceSecret,
            tally_host: tallyHost,
            tally_port: Number(tallyPort) || 9000,
          },
        });
        await invoke('start_polling');
        setPolling(true);
        setStatus({ state: 'ok', detail: 'Polling for jobs…' });
      } else {
        setStatus({
          state: 'error',
          detail: 'Open this UI via `cargo tauri dev` (browser-only preview cannot reach Tally).',
        });
      }
    } catch (e) {
      setStatus({ state: 'error', detail: String(e) });
    }
  }, [apiBase, deviceId, deviceSecret, tallyHost, tallyPort, isTauri]);

  const stop = useCallback(async () => {
    if (isTauri) await invoke('stop_polling');
    setPolling(false);
    setStatus({ state: 'idle', detail: 'Stopped' });
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri || !polling) return;
    const id = setInterval(async () => {
      try {
        const s = await invoke<Status>('get_status');
        setStatus(s);
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [isTauri, polling]);

  return (
    <div className="app">
      <h1>KhataLens Tally Bridge</h1>
      <p className="muted">
        Pair a device from web Settings → Bridge, then keep this app running while Tally XML Server is on.
      </p>

      <label>API base URL</label>
      <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />

      <label>Device ID</label>
      <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />

      <label>Device secret</label>
      <input
        type="password"
        value={deviceSecret}
        onChange={(e) => setDeviceSecret(e.target.value)}
        autoComplete="off"
      />

      <label>Tally host</label>
      <input value={tallyHost} onChange={(e) => setTallyHost(e.target.value)} />

      <label>Tally port</label>
      <input value={tallyPort} onChange={(e) => setTallyPort(e.target.value)} />

      {!polling ? (
        <button type="button" onClick={saveAndStart} disabled={!deviceId || !deviceSecret}>
          Save &amp; start polling
        </button>
      ) : (
        <button type="button" className="secondary" onClick={stop}>
          Stop
        </button>
      )}

      <div className={`status ${status.state === 'error' ? 'error' : status.state === 'ok' ? 'ok' : ''}`}>
        <strong>{status.state}</strong>
        {status.detail ? <div>{status.detail}</div> : null}
      </div>
    </div>
  );
}
