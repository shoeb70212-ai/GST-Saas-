import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useClient, type Client } from '../lib/ClientContext';
import { Plus, Building2, Trash2, Edit2, Loader2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClientsPage() {
  const { clients, loading, refreshClients, activeClientId, setActiveClientId } = useClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ client_name: '', gstin: '', pan: '' });
  const [isSaving, setIsSaving] = useState(false);

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
          .insert({ ...formData, user_id: session.user.id })
          .select()
          .single();
        if (error) throw error;
        
        // If this is the first client, set as active
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
    if (!window.confirm(`Are you sure you want to delete ${name}? All associated invoices will also be deleted!`)) {
      return;
    }
    
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast.success(`${entityName} deleted`);
      if (activeClientId === id) {
        setActiveClientId(null);
      }
      await refreshClients();
    } catch (error: any) {
      toast.error(`Failed to delete ${entityName.toLowerCase()}`);
      console.error(error);
    }
  };

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">{entityName} Management</h1>
          <p className="text-text-secondary">Manage your {entityNamePlural.toLowerCase()} to keep their invoices strictly separated.</p>
        </div>
        
        {!isAdding && !editingId && (
          <button 
            onClick={() => setIsAdding(true)}
            className="btn-primary"
          >
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
              <input
                type="text"
                required
                value={formData.client_name}
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                className="input-field w-full"
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">GSTIN (Optional)</label>
              <input
                type="text"
                value={formData.gstin}
                onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                className="input-field w-full"
                placeholder="29XXXXX1234X1X1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">PAN (Optional)</label>
              <input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({...formData, pan: e.target.value})}
                className="input-field w-full"
                placeholder="XXXXX1234X"
              />
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
          <button onClick={() => setIsAdding(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Your First {entityName}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
            <div key={client.id} className={`card p-5 group transition-all ${activeClientId === client.id ? 'border-accent ring-1 ring-accent/20 bg-accent-subtle/5' : 'hover:border-border'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-bg-sunken flex items-center justify-center">
                  <Building2 className={`w-5 h-5 ${activeClientId === client.id ? 'text-accent' : 'text-text-secondary'}`} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(client)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-sunken rounded" title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(client.id, client.client_name)} className="p-1.5 text-text-secondary hover:text-error hover:bg-error-subtle rounded" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <h3 className="font-semibold text-text-primary text-lg truncate mb-1">{client.client_name}</h3>
              <div className="space-y-1 text-sm text-text-secondary">
                <p>GSTIN: <span className="font-mono">{client.gstin || 'N/A'}</span></p>
                <p>PAN: <span className="font-mono">{client.pan || 'N/A'}</span></p>
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
    </div>
  );
}
