import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TaskEditorModal } from '../components/tasks/TaskEditorModal.jsx';
import { TaskInstancesModal } from '../components/tasks/TaskInstancesModal.jsx';
import { ChecklistView } from '../components/tasks/Checklist.jsx';
import { cloneFresh, countItems, toggleItem } from '../components/tasks/checklist.js';

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
  const { items: instances, reload: reloadInstances } = useResource('/task-instances');
  const { viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null);
  const [showInstances, setShowInstances] = useState(false);
  const [sortMode, setSortMode] = useState('due'); // 'due' | 'priority'
  const [expanded, setExpanded] = useState(() => new Set()); // task ids with checklist open
  // Checklist ticks show instantly; the saved copy replaces this on reload.
  const [checklistOverrides, setChecklistOverrides] = useState({});

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

  async function save(payload) {
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

  function checklistOf(t) {
    return checklistOverrides[t._id] || t.checklist || [];
  }

  async function toggleChecklistItem(t, itemId) {
    if (!viewingSelf) return;
    const next = toggleItem(checklistOf(t), itemId);
    setChecklistOverrides((o) => ({ ...o, [t._id]: next }));
    try {
      await api.put(`/tasks/${t._id}`, { checklist: next }, viewingId || undefined);
      await reload();
    } finally {
      setChecklistOverrides(({ [t._id]: _, ...rest }) => rest);
    }
  }

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // --- Task instances -------------------------------------------------
  async function createInstance(values) {
    await api.post('/task-instances', values, viewingId || undefined);
    await reloadInstances();
  }

  async function updateInstance(id, values) {
    await api.put(`/task-instances/${id}`, values, viewingId || undefined);
    await reloadInstances();
  }

  async function deleteInstance(inst) {
    if (!confirm(`Delete the task instance "${inst.name}"? Tasks already created from it are kept.`)) return;
    await api.del(`/task-instances/${inst._id}`, viewingId || undefined);
    await reloadInstances();
  }

  // Drops an independent copy of the instance onto the task list: same
  // name/link/note, and the checklist copied with new item ids and every
  // box unticked. Editing the task afterwards never touches the instance.
  async function useInstance(inst) {
    await api.post(
      '/tasks',
      {
        title: inst.name,
        link: inst.link || '',
        note: inst.note || '',
        checklist: cloneFresh(inst.checklist),
        clientId: null,
        priority: 'normal',
        fromInstance: inst._id,
      },
      viewingId || undefined
    );
    await reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">To do</div><h1>Tasks</h1></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setShowInstances(true)}>
            Task instances{instances.length ? ` (${instances.length})` : ''}
          </button>
          {viewingSelf && <button className="btn" onClick={() => setEditing({})}>Add task</button>}
        </div>
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
                {g.tasks.map((t) => {
                  const checklist = checklistOf(t);
                  const { total, done } = countItems(checklist);
                  const isOpen = expanded.has(t._id);
                  return (
                    <div key={t._id}>
                      <div className="row" style={{ gridTemplateColumns: '24px 1fr auto auto' }}>
                        <input type="checkbox" checked={t.done} disabled={!viewingSelf} onChange={() => toggle(t)} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--ink3)' : 'var(--ink)' }}>
                              {t.title}
                            </span>
                            {t.link && (
                              <a
                                className="task-link"
                                href={t.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t.link}
                              >
                                🔗 Open link
                              </a>
                            )}
                            {total > 0 && (
                              <button
                                type="button"
                                className={`checklist-toggle ${done === total ? 'complete' : ''}`}
                                onClick={() => toggleExpanded(t._id)}
                                title={isOpen ? 'Hide checklist' : 'Show checklist'}
                              >
                                {isOpen ? '▾' : '▸'} ☑ {done}/{total}
                              </button>
                            )}
                          </div>
                          {t.note && <div className="task-note">{t.note}</div>}
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
                      {total > 0 && isOpen && (
                        <div style={{ padding: '0 18px 12px 54px' }}>
                          <ChecklistView
                            items={checklist}
                            readOnly={!viewingSelf}
                            onToggle={(itemId) => toggleChecklistItem(t, itemId)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TaskEditorModal
          mode="task"
          initial={editing}
          clients={clients}
          instances={instances}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}

      {showInstances && (
        <TaskInstancesModal
          instances={instances}
          canEdit={viewingSelf}
          onCreate={createInstance}
          onUpdate={updateInstance}
          onDelete={deleteInstance}
          onUse={useInstance}
          onClose={() => setShowInstances(false)}
        />
      )}
    </main>
  );
}
