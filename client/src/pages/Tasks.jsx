import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

function sorters(mode) {
  if (mode === 'priority') {
    return (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || cmpDue(a, b);
  }
  return (a, b) => cmpDue(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}
function cmpDue(a, b) {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1; // no deadline sinks to the bottom
  if (!b.due) return -1;
  return a.due.localeCompare(b.due);
}

export function Tasks() {
  const { items, reload, viewingId } = useResource('/tasks');
  const { items: clients } = useResource('/clients');
  const { viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null);
  const [sortMode, setSortMode] = useState('due'); // 'due' | 'priority'

  const FIELDS = useMemo(
    () => [
      { k: 'title', label: 'Task', required: true },
      {
        k: 'clientId',
        label: 'Client (optional)',
        type: 'select',
        half: true,
        options: [['', 'No client — general task'], ...clients.map((c) => [c._id, c.name])],
      },
      { k: 'due', label: 'Due date', type: 'date', half: true },
      { k: 'priority', label: 'Priority', type: 'select', options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], half: true },
    ],
    [clients]
  );

  const groups = useMemo(() => {
    const clientName = Object.fromEntries(clients.map((c) => [c._id, c.name]));
    const byClient = new Map();
    for (const t of items) {
      const key = t.clientId || '__general';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key).push(t);
    }
    const sorter = sorters(sortMode);
    const groupList = [...byClient.entries()].map(([key, tasks]) => ({
      key,
      label: key === '__general' ? 'General (no client)' : clientName[key] || 'Unknown client',
      tasks: [...tasks].sort(sorter),
    }));
    // General first, then clients alphabetically.
    groupList.sort((a, b) => {
      if (a.key === '__general') return -1;
      if (b.key === '__general') return 1;
      return a.label.localeCompare(b.label);
    });
    return groupList;
  }, [items, clients, sortMode]);

  async function save(values) {
    const payload = { ...values, clientId: values.clientId || null };
    if (editing?._id) await api.put(`/tasks/${editing._id}`, payload, viewingId || undefined);
    else await api.post('/tasks', payload, viewingId || undefined);
    await reload();
  }

  async function toggle(t) {
    if (!viewingSelf) return;
    await api.put(`/tasks/${t._id}`, { done: !t.done }, viewingId || undefined);
    reload();
  }

  async function remove(id) {
    if (!confirm('Delete this task?')) return;
    await api.del(`/tasks/${id}`, viewingId || undefined);
    reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">To do</div><h1>Tasks</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setEditing({})}>Add task</button>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)', fontWeight: 600 }}>Sort by</span>
        <button className={`btn sm ${sortMode === 'due' ? '' : 'ghost'}`} onClick={() => setSortMode('due')}>Deadline</button>
        <button className={`btn sm ${sortMode === 'priority' ? '' : 'ghost'}`} onClick={() => setSortMode('priority')}>Priority</button>
      </div>

      {items.length === 0 ? (
        <div className="card"><div className="empty"><b>Nothing on the list</b>Add a task to keep track of it.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <div key={g.key} className="card">
              <div className="card-h">
                <h2>{g.label}</h2>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{g.tasks.length}</span>
              </div>
              <div className="stack">
                {g.tasks.map((t) => (
                  <div key={t._id} className="row" style={{ gridTemplateColumns: '24px 1fr auto auto' }}>
                    <input type="checkbox" checked={t.done} disabled={!viewingSelf} onChange={() => toggle(t)} />
                    <div style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--ink3)' : 'var(--ink)' }}>
                      {t.title}
                    </div>
                    <span className={`tag ${t.priority === 'high' ? 'rose' : t.priority === 'low' ? 'green' : 'ochre'}`}>
                      {t.priority}{t.due ? ` · ${t.due}` : ''}
                    </span>
                    {viewingSelf && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost sm" onClick={() => setEditing(t)}>Edit</button>
                        <button className="btn danger sm" onClick={() => remove(t._id)}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FormModal
          title={editing._id ? 'Edit task' : 'Add task'}
          fields={FIELDS}
          initial={editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
