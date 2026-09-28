import { useState } from 'react';
import { Modal } from '../Modal.jsx';
import { TaskEditorModal } from './TaskEditorModal.jsx';
import { countItems } from './checklist.js';

// The Task Instance library: reusable task blueprints, managed in their
// own list. "Add to tasks" drops an independent copy onto the task list.
export function TaskInstancesModal({ instances, canEdit, onCreate, onUpdate, onDelete, onUse, onClose }) {
  const [editing, setEditing] = useState(null); // {} = new, instance = edit
  const [addedId, setAddedId] = useState(null);
  const [query, setQuery] = useState('');

  const shown = instances.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function use(inst) {
    await onUse(inst);
    setAddedId(inst._id);
    setTimeout(() => setAddedId((id) => (id === inst._id ? null : id)), 1600);
  }

  return (
    <>
      <Modal title="Task instances" onClose={onClose} width={680}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="field"
            placeholder="Search instances…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          {canEdit && <button className="btn" onClick={() => setEditing({})}>+ New instance</button>}
        </div>

        {instances.length === 0 ? (
          <div className="empty">
            <b>No task instances yet</b>
            Save a task you repeat often as an instance, then add a fresh copy of it to your task list whenever you need it.
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">No instances match “{query}”.</div>
        ) : (
          <div className="stack" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
            {shown.map((inst) => {
              const { total } = countItems(inst.checklist);
              return (
                <div key={inst._id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{inst.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {total > 0 && <span>☑ {total} checklist item{total === 1 ? '' : 's'}</span>}
                      {inst.link && (
                        <a href={inst.link} target="_blank" rel="noopener noreferrer" className="task-link">🔗 Link</a>
                      )}
                      {inst.note && <span className="truncate" style={{ maxWidth: 260 }}>{inst.note}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm" onClick={() => use(inst)} title="Add an independent copy of this to your task list">
                        {addedId === inst._id ? 'Added ✓' : 'Add to tasks'}
                      </button>
                      <button className="btn ghost sm" onClick={() => setEditing(inst)}>Edit</button>
                      <button className="btn danger sm" onClick={() => onDelete(inst)}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {editing && (
        <TaskEditorModal
          mode="instance"
          initial={editing}
          onSubmit={(values) => (editing._id ? onUpdate(editing._id, values) : onCreate(values))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
