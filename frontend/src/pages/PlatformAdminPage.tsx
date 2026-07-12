import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity, Users, FileText, IndianRupee, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';


const PlatformAdminPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchMetrics(session.access_token);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchMetrics = async (token: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const [metricsRes, tenantsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/metrics`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/tenants`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (!metricsRes.ok || !tenantsRes.ok) throw new Error('Failed to fetch admin data. You may not be authorized.');
      
      const metricsData = await metricsRes.json();
      const tenantsData = await tenantsRes.json();
      
      setMetrics(metricsData.metrics);
      setTenants(tenantsData.tenants || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleAction = async (action: string, t: any) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    if (action === 'quota') {
      const newQuota = prompt(`Enter new quota for ${t.company_name}:`, t.credits);
      if (newQuota && !isNaN(Number(newQuota))) {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/update`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: t.id, new_quota: Number(newQuota) })
        });
        if (res.ok) fetchMetrics(session.access_token);
        else alert("Failed to update quota");
      }
    } else if (action === 'suspend') {
      if (confirm(`Are you sure you want to suspend ${t.company_name}? They will not be able to scan new invoices.`)) {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/update`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: t.id, new_quota: 0 })
        });
        if (res.ok) fetchMetrics(session.access_token);
        else alert("Failed to suspend tenant");
      }
    } else if (action === 'profile') {
      const newName = prompt(`Enter new company name for ${t.email}:`, t.company_name);
      if (newName && newName.trim() !== '') {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}/profile`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_name: newName.trim() })
        });
        if (res.ok) fetchMetrics(session.access_token);
        else alert("Failed to update profile");
      }
    } else if (action === 'delete') {
      if (confirm(`CRITICAL WARNING: Are you sure you want to PERMANENTLY DELETE ${t.company_name} and all their data? This cannot be undone.`)) {
        const res = await fetch(`${apiUrl}/api/admin/tenants/${t.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (res.ok) fetchMetrics(session.access_token);
        else alert("Failed to delete tenant");
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  // Very basic RBAC check for MVP: only show to someone if they could fetch the metrics successfully.
  if (!session || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">{error || 'You do not have platform admin privileges.'}</p>
          <a href="/dashboard" className="text-blue-600 font-medium hover:underline">Return to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-indigo-600 p-3 rounded-xl">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Admin</h1>
            <p className="text-gray-500">Global system metrics and usage tracking.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 text-blue-600 mb-4">
              <FileText className="w-5 h-5" />
              <h3 className="font-semibold text-gray-700">Total Invoices</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900">{metrics?.total_invoices || 0}</p>
            <p className="text-sm text-gray-500 mt-2">Processed globally</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 text-green-600 mb-4">
              <IndianRupee className="w-5 h-5" />
              <h3 className="font-semibold text-gray-700">Est. API Cost</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900">₹ {metrics?.estimated_cost_inr || '0.00'}</p>
            <p className="text-sm text-gray-500 mt-2">Based on ~₹0.06 per scan</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 text-purple-600 mb-4">
              <Users className="w-5 h-5" />
              <h3 className="font-semibold text-gray-700">Active CA Firms</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900">{metrics?.active_tenants || 0}</p>
            <p className="text-sm text-gray-500 mt-2">Tenants using the platform</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 text-orange-600 mb-4">
              <Activity className="w-5 h-5" />
              <h3 className="font-semibold text-gray-700">Total End-Clients</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900">{metrics?.total_clients || 0}</p>
            <p className="text-sm text-gray-500 mt-2">Managed by CA firms</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Tenant Quota Management</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-3 text-sm font-semibold text-gray-600">Company Name</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Email</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Signup Date</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600 text-center">Clients Managed</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600 text-center">Invoices Scanned</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600 text-center">Est. AI Cost</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600 text-center">Available Quota</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td className="py-4 text-gray-900 text-sm" colSpan={8}>
                      <p className="text-center text-gray-500">No tenants found.</p>
                    </td>
                  </tr>
                ) : (
                  tenants.map((t: any) => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 text-sm font-medium text-gray-900">{t.company_name}</td>
                      <td className="py-4 text-sm text-gray-500">{t.email}</td>
                      <td className="py-4 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-4 text-sm text-gray-900 text-center">{t.clients_managed || 0}</td>
                      <td className="py-4 text-sm text-gray-900 text-center">{t.invoices_processed}</td>
                      <td className="py-4 text-sm text-gray-900 text-center">₹ {(t.invoices_processed * 0.065).toFixed(2)}</td>
                      <td className="py-4 text-sm text-gray-900 text-center">
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          {t.credits} left
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                                handleAction(e.target.value, t);
                                e.target.value = "";
                            }
                          }}
                          className="bg-transparent border border-gray-300 rounded-md px-2 py-1 text-sm outline-none cursor-pointer text-indigo-700 hover:border-indigo-500 font-medium"
                          defaultValue=""
                        >
                          <option value="" disabled hidden>Actions...</option>
                          <option value="quota">Edit Quota</option>
                          <option value="suspend">Suspend (Quota=0)</option>
                          <option value="profile">Edit Profile</option>
                          <option value="delete">Delete Tenant</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PlatformAdminPage;
