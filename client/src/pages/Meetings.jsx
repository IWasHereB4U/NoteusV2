import { useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

export const MEETING_STATUSES = ['Not Completed', 'Ongoing', 'Completed', 'Cancelled'];
export const STATUS_COLORS = {
  'Not Completed': '#8A8F8E',
  Ongoing: '#DB9A2F',
  Completed: '#1F9D6B',
  Cancelled: '#C0392B',
};

const FIELDS = [
  { k: 'title', label: 'Title', required: true },
  { k: 'date', label: 'Date', type: 'date', half: true },
  { k: 'startTime', label: 'Start time', type: 'time', half: true },
  { k: 'endTime', label: 'End time', type: 'time', half: true },
  { k: 'location', label: 'Location (optional)', half: true, placeholder: 'e.g. Conference Room B' },
  { k: 'status', label: 'Status', type: 'select', half: true, options: MEETING_STATUSES.map((s) => [s, s]) },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];

export function Meetings() {
  const { items, reload, viewingId } = useResource('/meetings');
  const { viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null);

  async function save(values) {
    if (editing?._id) await api.put(`/meetings/${editing._id}`, values, viewingId || undefined);
    else await api.post('/meetings', values, viewingId || undefined);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Delete this meeting?')) return;
    await api.del(`/meetings/${id}`, viewingId || undefined);
    reload();
  }

  async function setStatus(m, status) {
    if (status === m.status) return;
    await api.put(`/meetings/${m._id}`, { status }, viewingId || undefined);
    reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Calendar</div><h1>Meetings</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setEditing({ status: 'Not Completed' })}>Add meeting</button>}
      </div>

      <div className="card">
        <div className="card-h"><h2>Upcoming & past</h2></div>
        {items.length === 0 ? (
          <div className="empty"><b>Nothing scheduled</b>Add a meeting to keep it on the record.</div>
        ) : (
          <div className="stack">
            {items.map((m) => {
              const status = m.status || 'Not Completed';
              return (
                <div key={m._id} className="row">
                  <div className="d">{m.date} {m.startTime}{m.endTime ? `–${m.endTime}` : ''}</div>
                  <div>
                    {m.title}
                    {m.location && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>📍 {m.location}</div>}
                    {m.notes && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{m.notes}</div>}
                  </div>
                  {viewingSelf ? (
                    <select
                      className="field sm"
                      value={status}
                      onChange={(e) => setStatus(m, e.target.value)}
                      style={{
                        color: STATUS_COLORS[status], borderColor: STATUS_COLORS[status],
                        fontWeight: 600, fontSize: 11.5, width: 'auto',
                      }}
                    >
                      {MEETING_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className="tag"
                      style={{ background: STATUS_COLORS[status], color: '#fff', fontSize: 11 }}
                    >
                      {status}
                    </span>
                  )}
                  {viewingSelf && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setEditing(m)}>Edit</button>
                      <button className="btn danger sm" onClick={() => remove(m._id)}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing._id ? 'Edit meeting' : 'Add meeting'}
          fields={FIELDS}
          initial={{ ...editing, status: editing.status || 'Not Completed' }}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
