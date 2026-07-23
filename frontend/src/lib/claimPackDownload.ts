import { supabase } from './supabase';
import { getApiUrl } from './api';

/** Download multi-sheet audit claim pack Excel for client + period. */
export async function downloadClaimPack(clientId: string, period: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required');

  const qs = new URLSearchParams({ client_id: clientId, period });
  const response = await fetch(`${getApiUrl()}/api/audit/claim-pack?${qs}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to download claim pack');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KhataLens_ClaimPack_${period}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
