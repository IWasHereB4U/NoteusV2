import { useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

const FIELDS = [
  { k: 'name', label: 'Name', required: true, half: true },
  { k: 'company', label: 'Company', half: true },
  { k: 'email', label: 'Email', half: true },
  { k: 'phone', label: 'Phone', half: true },
  { k: 'rate', label: 'Rate', type: 'number', half: true },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];

export function Clients() {
  const { items, reload, viewingId } = useResource('/clients');
  const { viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null); // null=closed, {}=new, {...}=edit
  const [error, setError] = useState('');

  async function save(values) {
    setError('');
    if (editing?._id) await api.put(`/clients/${editing._id}`, values, viewingId || undefined);
    else await api.post('/clients', values, viewingId || undefined);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Remove this client?')) return;
    try {
      await api.del(`/clients/${id}`, viewingId || undefined);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Roster</div>
          <h1>Clients</h1>
        </div>
        {viewingSelf && <button className="btn" onClick={() => setEditing({})}>Add client</button>}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="card-h"><h2>All clients</h2></div>
        {items.length === 0 ? (
          <div className="empty"><b>No clients yet</b>Add the people or companies you bill.</div>
        ) : (
          <div className="stack">
            {items.map((c) => (
              <div key={c._id} className="row" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>{c.company}</div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{c.email} {c.phone}</div>
                {viewingSelf && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setEditing(c)}>Edit</button>
                    <button className="btn danger sm" onClick={() => remove(c._id)}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing._id ? 'Edit client' : 'Add client'}
          fields={FIELDS}
          initial={editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
