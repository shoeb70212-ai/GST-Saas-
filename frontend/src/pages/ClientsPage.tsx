import React from 'react';
import { useState  } from "react";
import { supabase } from '../lib/supabase';
import { useClient, type Client } from '../lib/ClientContext';
import { Plus, Building2, Trash2, Edit2, Loader2, Save, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../components/ui/Modal';

export default function ClientsPage() {
  const { clients, loading, refreshClients, activeClientId, setActiveClientId } = useClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ client_name: '', gstin: '', pan: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, number>>({});

  // Enterprise RBAC State
  const [userRole, setUserRole] = useState<string>('accountant');
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [managingAccessFor, setManagingAccessFor] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [assignedMembers, setAssignedMembers] = useState<string[]>([]);
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);

  React.useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.from('invoices').select('client_id');
      if (data) {
        const counts = data.reduce((acc: any, curr: any) => {
          acc[curr.client_id] = (acc[curr.client_id] || 0) + 1;
          return acc;
        }, {});
        setInvoiceCounts(counts);
      }
    };
    if (clients.length > 0) fetchCounts();
  }, [clients]);

  React.useEffect(() => {
    const fetchRoleAndTeam = async () => {
      const { data: orgData } = await supabase.rpc('get_user_orgs');
      if (orgData && orgData.length > 0) {
        setUserRole(orgData[0].role);
        setCurrentOrgId(orgData[0].org_id);
        if (orgData[0].role === 'owner' || orgData[0].role === 'admin') {
          const { data: members } = await supabase
            .from('organization_members')
            .select('user_id, role, profiles(company_name)')
            .eq('org_id', orgData[0].org_id)
            .eq('role', 'accountant');
          if (members) setTeamMembers(members);
        }
      }
    };
    fetchRoleAndTeam();
  }, []);

  const isBusiness = localStorage.getItem('accountType') === 'business';
  const entityName = isBusiness ? 'Business' : 'Client';
  const entityNamePlural = isBusiness ? 'Businesses' : 'Clients';

  const resetForm = () => {
    setFormData({ client_name: '', gstin: '', pan: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleEdit = (client: Client) => {
    setFormData({ client_name: client.client_name, gstin: client.gstin || '', pan: client.pan || '' });
    setEditingId(client.id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name) {
      toast.error('Client name is required');
      return;
    }
    
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      if (editingId) {
        const { error } = await supabase
          .from('clients')
          .update(formData)
          .eq('id', editingId);
        if (error) throw error;
        toast.success(`${entityName} updated successfully`);
      } else {
        const { error, data } = await supabase
          .from('clients')
          .insert({ ...formData, user_id: session.user.id, org_id: currentOrgId })
          .select()
          .single();
        if (error) throw error;
        
        if (clients.length === 0 && data) {
          setActiveClientId(data.id);
        }
        
        toast.success(`${entityName} added successfully`);
      }
      await refreshClients();
      resetForm();
    } catch (error: any) {
      toast.error(error.message || `Failed to save ${entityName.toLowerCase()}`);
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? All associated invoices will also be deleted!`)) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast.success(`${entityName} deleted`);
      if (activeClientId === id) setActiveClientId(null);
      await refreshClients();
    } catch (error: any) {
      toast.error(`Failed to delete ${entityName.toLowerCase()}`);
    }
  };

  const handleOpenManageAccess = async (clientId: string) => {
    setManagingAccessFor(clientId);
    const { data } = await supabase.from('client_assignments').select('user_id').eq('client_id', clientId);
    if (data) {
      setAssignedMembers(data.map(d => d.user_id));
    } else {
      setAssignedMembers([]);
    }
  };

  const handleSaveAccess = async () => {
    if (!managingAccessFor) return;
    setIsUpdatingAccess(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('client_assignments').delete().eq('client_id', managingAccessFor);
      
      if (assignedMembers.length > 0) {
        const inserts = assignedMembers.map(uid => ({
          client_id: managingAccessFor,
          user_id: uid,
          assigned_by: session?.user.id
        }));
        await supabase.from('client_assignments').insert(inserts);
      }
      toast.success('Access updated successfully');
      setManagingAccessFor(null);
    } catch (e) {
      toast.error('Failed to update access');
    } finally {
      setIsUpdatingAccess(false);
    }
  };

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-20 relative">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">{entityName} Management</h1>
          <p className="text-text-secondary">Manage your {entityNamePlural.toLowerCase()} to keep their invoices strictly separated.</p>
        </div>
        
        {!isAdding && !editingId && (userRole === 'owner' || userRole === 'admin') && (
          <button onClick={() => setIsAdding(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add {entityName}
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="card p-6 border-accent/20 bg-accent-subtle/5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            {editingId ? `Edit ${entityName}` : `Add New ${entityName}`}
          </h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">{entityName} Name <span className="text-error">*</span></label>
              <input type="text" required value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} className="input-field w-full" placeholder="e.g. Acme Corp" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">GSTIN (Optional)</label>
              <input type="text" value={formData.gstin} onChange={(e) => setFormData({...formData, gstin: e.target.value})} className="input-field w-full" placeholder="29XXXXX1234X1X1" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">PAN (Optional)</label>
              <input type="text" value={formData.pan} onChange={(e) => setFormData({...formData, pan: e.target.value})} className="input-field w-full" placeholder="XXXXX1234X" />
            </div>
            
            <div className="md:col-span-2 flex items-center justify-end gap-3 mt-4">
              <button type="button" onClick={resetForm} className="btn-ghost">
                <X className="w-4 h-4" /> Cancel
              </button>
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Save Changes' : `Create ${entityName}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {clients.length === 0 && !isAdding ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center border-dashed border-border border-2">
          <div className="w-16 h-16 rounded-full bg-bg-sunken flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-text-disabled" />
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">No {entityNamePlural} Yet</h3>
          <p className="text-text-secondary max-w-md mb-6">
            Add your first {entityName.toLowerCase()} to start organizing invoices and managing their data securely.
          </p>
          {(userRole === 'owner' || userRole === 'admin') && (
            <button onClick={() => setIsAdding(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Your First {entityName}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client: any) => (
            <div key={client.id} className={`card p-5 group transition-all ${activeClientId === client.id ? 'border-accent ring-1 ring-accent/20 bg-accent-subtle/5' : 'hover:border-border'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-bg-sunken flex items-center justify-center">
                  <Building2 className={`w-5 h-5 ${activeClientId === client.id ? 'text-accent' : 'text-text-secondary'}`} />
                </div>
                {(userRole === 'owner' || userRole === 'admin') && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenManageAccess(client.id)} className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent-subtle rounded" title="Manage Team Access">
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleEdit(client)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(client.id, client.client_name)} className="p-1.5 text-text-secondary hover:text-error hover:bg-error-subtle rounded" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              <h3 className="font-semibold text-text-primary text-lg truncate mb-1">{client.client_name}</h3>
              <div className="space-y-1 text-sm text-text-secondary mt-2">
                <p className="flex justify-between"><span>GSTIN:</span> <span className="font-mono">{client.gstin || 'N/A'}</span></p>
                <p className="flex justify-between"><span>PAN:</span> <span className="font-mono">{client.pan || 'N/A'}</span></p>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="text-xs text-text-disabled">Total Invoices</span>
                <span className="text-sm font-bold text-accent bg-accent-subtle px-2 py-0.5 rounded">
                  {invoiceCounts[client.id] || 0}
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-textMuted flex items-center gap-1">
                  Added {new Date(client.created_at).toLocaleDateString()}
                </span>
                {activeClientId === client.id ? (
                  <span className="text-xs font-medium text-accent bg-accent-subtle px-2 py-1 rounded">Active</span>
                ) : (
                  <button onClick={() => setActiveClientId(client.id)} className="text-xs font-medium text-text-secondary hover:text-primary transition-colors">
                    Set Active
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MANAGE ACCESS MODAL */}
      <Modal
        isOpen={!!managingAccessFor}
        onClose={() => setManagingAccessFor(null)}
        title={
          <div>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" /> Manage Access
            </h3>
            <p className="text-xs text-text-secondary mt-1 font-normal">Assign accountants who can view this client.</p>
          </div>
        }
        size="md"
      >
        <div className="space-y-3 pr-2 mb-6">
              {teamMembers.length === 0 ? (
                <div className="p-4 bg-bg-sunken rounded-lg text-center text-sm text-text-secondary">
                  No accountants found in your firm. Add them via Settings &gt; Team Management.
                </div>
              ) : (
                teamMembers.map(member => (
                  <label key={member.user_id} className="flex items-center gap-3 p-3 bg-bg-sunken border border-border rounded-xl cursor-pointer hover:border-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                      checked={assignedMembers.includes(member.user_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAssignedMembers([...assignedMembers, member.user_id]);
                        } else {
                          setAssignedMembers(assignedMembers.filter(id => id !== member.user_id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary capitalize">{member.profiles?.company_name || 'Accountant'}</p>
                      <p className="text-xs text-text-secondary font-mono truncate">{member.user_id.substring(0, 16)}...</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
              <button onClick={() => setManagingAccessFor(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleSaveAccess} disabled={isUpdatingAccess} className="btn-primary flex-1">
                {isUpdatingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Access'}
              </button>
          </div>

      </Modal>
    </div>
  );
}
