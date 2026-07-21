import { useEffect, useState } from "react";
import { supabase } from '../lib/supabase';
import { ShieldAlert, Loader2, Search, ArrowRight, User, Hash, Clock } from 'lucide-react';
import { format } from 'date-fns';

type AuditLog = {
  id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  created_at: string;
  user_label?: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('accountant');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data: orgData } = await supabase.rpc('get_user_orgs');
        if (!orgData?.length) return;

        setUserRole(orgData[0].role);
        if (orgData[0].role !== 'owner' && orgData[0].role !== 'admin') return;

        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('org_id', orgData[0].org_id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        const rows = (data || []) as AuditLog[];
        const userIds = [...new Set(rows.map((l) => l.user_id).filter(Boolean))] as string[];

        let profileMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, company_name, email')
            .in('id', userIds);

          for (const p of profiles || []) {
            profileMap.set(p.id, p.company_name || p.email || p.id);
          }
        }

        setLogs(rows.map((row) => ({
          ...row,
          user_label: row.user_id ? (profileMap.get(row.user_id) || row.user_id) : 'System',
        })));
      } catch (e) {
        console.error('Failed to fetch audit logs', e);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const q = search.toLowerCase();
    return (
      (l.entity_type || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.entity_id || '').toLowerCase().includes(q) ||
      (l.user_label || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (userRole === 'accountant') {
    return (
      <div className="p-8 max-w-5xl mx-auto flex flex-col items-center justify-center text-center mt-20">
        <ShieldAlert className="w-16 h-16 text-error opacity-50 mb-4" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Access Restricted</h1>
        <p className="text-text-secondary">Audit Logs are only accessible to Firm Owners and Admins.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-accent" /> Firm Audit Logs
          </h1>
          <p className="text-text-secondary">Immutable tracking of all critical data changes in your firm.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-disabled" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full !pl-10"
          />
        </div>
      </div>

      <div className="bg-bg-sunken border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-base border-b border-border text-text-secondary">
              <tr>
                <th className="px-6 py-4 font-medium"><div className="flex items-center gap-2"><Clock className="w-4 h-4"/> Timestamp</div></th>
                <th className="px-6 py-4 font-medium"><div className="flex items-center gap-2"><User className="w-4 h-4"/> User</div></th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Table</th>
                <th className="px-6 py-4 font-medium"><div className="flex items-center gap-2"><Hash className="w-4 h-4"/> Record ID</div></th>
                <th className="px-6 py-4 font-medium">Changes (Old &rarr; New)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-disabled">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-bg-base/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-text-secondary">
                      {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-text-primary capitalize">{log.user_label}</span>
                      {log.user_id && (
                        <div className="text-[10px] text-text-disabled font-mono truncate max-w-[120px]" title={log.user_id}>
                          {log.user_id}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase
                        ${log.action.includes('INSERT') ? 'bg-success/10 text-success' :
                          log.action.includes('UPDATE') ? 'bg-warning/10 text-warning' :
                          'bg-error/10 text-error'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-accent">
                      {log.entity_type}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-text-secondary font-mono truncate max-w-[150px]" title={log.entity_id}>
                        {log.entity_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono max-w-xs overflow-hidden">
                      {log.action.includes('UPDATE') ? (
                        <div className="flex items-center gap-2 text-text-secondary truncate">
                          <span className="line-through opacity-50 truncate max-w-[100px]" title={JSON.stringify(log.previous_state)}>{JSON.stringify(log.previous_state).substring(0, 20)}...</span>
                          <ArrowRight className="w-3 h-3 text-accent flex-shrink-0" />
                          <span className="text-text-primary truncate max-w-[100px]" title={JSON.stringify(log.new_state)}>{JSON.stringify(log.new_state).substring(0, 20)}...</span>
                        </div>
                      ) : log.action.includes('INSERT') ? (
                        <span className="text-text-primary truncate block max-w-[200px]" title={JSON.stringify(log.new_state)}>{JSON.stringify(log.new_state).substring(0, 30)}...</span>
                      ) : (
                        <span className="text-text-disabled truncate block max-w-[200px]" title={JSON.stringify(log.previous_state)}>{JSON.stringify(log.previous_state).substring(0, 30)}...</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
