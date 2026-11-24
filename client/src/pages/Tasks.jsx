import { useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useCollapsed } from '../hooks/useCollapsed.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TaskEditorModal } from '../components/tasks/TaskEditorModal.jsx';
import { TaskInstancesModal } from '../components/tasks/TaskInstancesModal.jsx';
import { ChecklistView } from '../components/tasks/Checklist.jsx';
import { AttachmentList } from '../components/tasks/AttachmentList.jsx';
import { MacroListView } from '../components/tasks/MacroList.jsx';
import { cloneFresh, countItems, newItemId, toggleItem, toggleVerifyBox } from '../components/tasks/checklist.js';
import { cloneMacros } from '../utils/formMacros.js';
import { tasksToText, downloadText, slugify } from '../utils/exportTasks.js';
import { parseTasksText, planImport } from '../utils/importTasks.js';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

// Hand-sorted: tasks the person has placed (drag and drop) come first, in that
// order; anything never placed follows, by deadline.
function cmpManual(a, b) {
  const ah = a.order != null;
  const bh = b.order != null;
  if (ah && bh) return a.order - b.order || cmpDue(a, b);
  if (ah) return -1;
  if (bh) return 1;
  return cmpDue(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

const SORT_KEY = 'tasks-sort-mode';
const readSortMode = () => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'priority' || v === 'manual' ? v : 'due';
  } catch {
    return 'due';
  }
};

function sorters(mode) {
  if (mode === 'manual') return cmpManual;
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
  const { viewingSelf, user } = useAuth();
  const [editing, setEditing] = useState(null);
  const [showInstances, setShowInstances] = useState(false);
  const importRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [sortMode, setSortModeState] = useState(readSortMode); // 'due' | 'priority' | 'manual'
  const setSortMode = (m) => {
    setSortModeState(m);
    try { localStorage.setItem(SORT_KEY, m); } catch { /* not fatal */ }
  };
  // Drag-and-drop: which task is being dragged, and the line showing where it will land.
  const [drag, setDrag] = useState(null); // { id, group }
  const [dropAt, setDropAt] = useState(null); // { id, pos: 'before' | 'after' }
  // A new order shows instantly; the saved copy replaces it on reload.
  const [orderOverrides, setOrderOverrides] = useState({});
  const [expanded, setExpanded] = useState(() => new Set()); // task ids with checklist/macros open
  // Client groups folded away (remembered between visits).
  const { collapsed: foldedGroups, toggle: toggleGroup, remove: unfoldGroups } = useCollapsed('tasks-folded-groups');
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
    for (const [, tasks] of byClient) {
      tasks.forEach((t, i) => {
        if (orderOverrides[t._id] !== undefined) tasks[i] = { ...t, order: orderOverrides[t._id] };
      });
    }
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
  }, [items, clients, sortMode, orderOverrides]);

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

  async function toggleChecklistItem(t, itemId, box) {
    if (!viewingSelf) {
      // Someone else's task: the only thing allowed is the second box of a
      // "needs verification" checklist. The server enforces it too.
      if (!(t.needsVerification && box === 'check2')) return;
      try {
        await api.put(`/tasks/${t._id}/verify`, { itemId }, viewingId || undefined);
      } catch (err) {
        alert(err.message || "Couldn't update that box");
      }
      await reload();
      return;
    }
    const by = { id: user?.id, name: user?.name, at: new Date().toISOString() };
    const next = t.needsVerification && box
      ? toggleVerifyBox(checklistOf(t), itemId, box, by)
      : toggleItem(checklistOf(t), itemId);
    setChecklistOverrides((o) => ({ ...o, [t._id]: next }));
    try {
      await api.put(`/tasks/${t._id}`, { checklist: next }, viewingId || undefined);
      await reload();
    } finally {
      setChecklistOverrides(({ [t._id]: _, ...rest }) => rest);
    }
  }

  // Saves a new top-to-bottom order for one group's tasks and switches the list
  // to manual sorting so the order is what's shown.
  async function applyOrder(ids) {
    if (!viewingSelf) return;
    setSortMode('manual');
    setOrderOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id, i) => [id, i])) }));
    try {
      await api.put('/tasks/reorder', { ids }, viewingId || undefined);
      await reload();
    } catch (err) {
      alert(err.message || "Couldn't save the new order");
    } finally {
      setOrderOverrides((o) => {
        const rest = { ...o };
        ids.forEach((id) => delete rest[id]);
        return rest;
      });
    }
  }

  function moveTo(group, dragId, targetId, pos) {
    if (dragId === targetId) return;
    const ids = group.tasks.map((x) => x._id).filter((id) => id !== dragId);
    const at = ids.indexOf(targetId);
    if (at === -1) return;
    ids.splice(pos === 'after' ? at + 1 : at, 0, dragId);
    applyOrder(ids);
  }

  // ▲ / ▼ — the same reorder without a mouse (and for touch screens, where
  // dragging a row isn't available).
  function nudge(group, id, delta) {
    const ids = group.tasks.map((x) => x._id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
  }

  function endDrag() {
    setDrag(null);
    setDropAt(null);
  }

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Tasks that have something to open (a checklist or macros).
  const expandableIds = useMemo(
    () => items.filter((t) => (t.checklist || []).length > 0 || (t.macros || []).length > 0).map((t) => t._id),
    [items]
  );
  const allOpen = expandableIds.length > 0 && expandableIds.every((id) => expanded.has(id));

  function expandAll() {
    setExpanded(new Set(expandableIds));
    unfoldGroups(groups.map((g) => g.key));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function exportTxt() {
    const text = tasksToText(groups, checklistOf, { sortLabel: sortMode === 'priority' ? 'priority' : sortMode === 'manual' ? 'manual order' : 'deadline' });
    downloadText(`tasks-${new Date().toISOString().slice(0, 10)}.txt`, text);
  }

  // Export just one task (with its checklist and note).
  function exportOne(t, groupLabel) {
    const text = tasksToText([{ label: groupLabel, tasks: [t] }], checklistOf);
    downloadText(`task-${slugify(t.title)}-${new Date().toISOString().slice(0, 10)}.txt`, text);
  }

  // Reads a .txt made by Export (whole list or one task). A task whose title
  // matches an existing one overwrites it; every other task is added.
  async function importTxt(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = ''; // lets the same file be picked again later
    if (!file || !viewingSelf) return;
    let done = 0;
    try {
      const parsed = parseTasksText(await file.text());
      const plan = planImport(parsed, items, clients);
      const total = plan.creates.length + plan.updates.length;
      if (!total) {
        alert('No tasks found in that file. Import reads the .txt files made by "Export .txt" / "Export".');
        return;
      }
      const shown = plan.updates.slice(0, 8).map((u) => `  • ${u.title}`);
      if (plan.updates.length > 8) shown.push(`  …and ${plan.updates.length - 8} more`);
      const msg = [
        `Import ${total} task${total === 1 ? '' : 's'} from ${file.name}?`,
        '',
        `${plan.creates.length} new`,
        `${plan.updates.length} will OVERWRITE the existing task with the same title`,
        ...(shown.length ? ['', ...shown] : []),
        ...(plan.updates.length ? ['', 'Overwriting replaces title, done, priority, due date, note, checklist and client. Link and macros are kept.'] : []),
        ...(plan.unmatchedClients.length ? ['', `No client named: ${plan.unmatchedClients.join(', ')} (new tasks go to General; overwritten ones keep their client).`] : []),
        ...(plan.skipped ? ['', `${plan.skipped} untitled task${plan.skipped === 1 ? '' : 's'} skipped.`] : []),
      ].join('\n');
      if (!confirm(msg)) return;
      setImporting(true);
      for (const u of plan.updates) { await api.put(`/tasks/${u.id}`, u.payload, viewingId || undefined); done += 1; }
      for (const c of plan.creates) { await api.post('/tasks', c.payload, viewingId || undefined); done += 1; }
    } catch (err) {
      alert(`Import stopped after ${done} task${done === 1 ? '' : 's'}: ${err.message || 'something went wrong'}`);
    } finally {
      setImporting(false);
      await reload();
    }
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
        needsVerification: !!inst.needsVerification,
        macros: cloneMacros(inst.macros, newItemId),
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
          {items.length > 0 && (
            <button className="btn ghost" onClick={exportTxt} title="Download the whole list, with checklists, as a .txt file">
              Export .txt
            </button>
          )}
          {viewingSelf && (
            <>
              <button className="btn ghost" onClick={() => importRef.current?.click()} disabled={importing} title="Load tasks from a .txt made by Export. A task with the same title overwrites the existing one.">
                {importing ? 'Importing…' : 'Import .txt'}
              </button>
              <input ref={importRef} type="file" accept=".txt,text/plain" onChange={importTxt} style={{ display: 'none' }} />
            </>
          )}
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
        <button className={`btn sm ${sortMode === 'manual' ? '' : 'ghost'}`} onClick={() => setSortMode('manual')} title="Your own order — drag a task by its ⋮⋮ handle">Manual</button>
        {viewingSelf && (
          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
            {sortMode === 'manual' ? 'Drag ⋮⋮ or use ▲▼ to reorder' : 'Drag ⋮⋮ to sort by hand'}
          </span>
        )}
        {items.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={expandAll} disabled={allOpen && foldedGroups.size === 0} title="Open every group and every task's checklist">
              Expand all
            </button>
            <button className="btn ghost sm" onClick={collapseAll} disabled={expanded.size === 0} title="Close every task's checklist and macros">
              Collapse all
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card"><div className="empty"><b>Nothing on the list</b>Add a task to keep track of it.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <div key={g.key} className="card">
              <div
                className="card-h task-group-head"
                onClick={() => toggleGroup(g.key)}
                role="button"
                tabIndex={0}
                aria-expanded={!foldedGroups.has(g.key)}
                title={foldedGroups.has(g.key) ? 'Show tasks' : 'Hide tasks'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(g.key); }
                }}
              >
                <h2><span className="task-group-caret">{foldedGroups.has(g.key) ? '▸' : '▾'}</span>{g.label}</h2>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{g.tasks.length}</span>
              </div>
              {!foldedGroups.has(g.key) && <div className="stack">
                {g.tasks.map((t) => {
                  const checklist = checklistOf(t);
                  const { total, done } = countItems(checklist);
                  const macros = t.macros || [];
                  const isOpen = expanded.has(t._id);
                  const isDropTarget = dropAt?.id === t._id && drag?.group === g.key;
                  return (
                    <div
                      key={t._id}
                      className={`task-wrap${drag?.id === t._id ? ' dragging' : ''}${isDropTarget ? ` drop-${dropAt.pos}` : ''}`}
                      onDragOver={(e) => {
                        if (!drag || drag.group !== g.key) return; // only reorder inside the same group
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const r = e.currentTarget.getBoundingClientRect();
                        const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
                        if (dropAt?.id !== t._id || dropAt.pos !== pos) setDropAt({ id: t._id, pos });
                      }}
                      onDrop={(e) => {
                        if (!drag || drag.group !== g.key) return;
                        e.preventDefault();
                        const pos = dropAt?.id === t._id ? dropAt.pos : 'before';
                        moveTo(g, drag.id, t._id, pos);
                        endDrag();
                      }}
                    >
                      <div className="row" style={{ gridTemplateColumns: viewingSelf ? '16px 24px 1fr auto auto' : '24px 1fr auto auto' }}>
                        {viewingSelf && (
                          <span
                            className="drag-handle"
                            draggable
                            title="Drag to move this task up or down"
                            aria-label={`Drag ${t.title} to reorder`}
                            onDragStart={(e) => {
                              const wrap = e.currentTarget.closest('.task-wrap');
                              if (wrap) e.dataTransfer.setDragImage(wrap, 12, 12);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', t._id);
                              setDrag({ id: t._id, group: g.key });
                            }}
                            onDragEnd={endDrag}
                          >
                            ⋮⋮
                          </span>
                        )}
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
                            {macros.length > 0 && (
                              <button
                                type="button"
                                className="checklist-toggle macros"
                                onClick={() => toggleExpanded(t._id)}
                                title={isOpen ? 'Hide macros' : 'Show extension macros'}
                              >
                                {total > 0 ? '' : isOpen ? '▾ ' : '▸ '}⚡ {macros.length} macro{macros.length === 1 ? '' : 's'}
                              </button>
                            )}
                          </div>
                          {t.note && <div className="task-note">{t.note}</div>}
                          <AttachmentList items={t.attachments} />
                        </div>
                        <span className={`tag ${t.priority === 'high' ? 'rose' : t.priority === 'low' ? 'green' : 'ochre'}`}>
                          {t.priority}{t.due ? ` · ${t.due}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {viewingSelf && sortMode === 'manual' && (
                            <>
                              <button className="btn ghost sm" onClick={() => nudge(g, t._id, -1)} disabled={g.tasks[0]?._id === t._id} title="Move up" aria-label="Move up">▲</button>
                              <button className="btn ghost sm" onClick={() => nudge(g, t._id, 1)} disabled={g.tasks[g.tasks.length - 1]?._id === t._id} title="Move down" aria-label="Move down">▼</button>
                            </>
                          )}
                          <button className="btn ghost sm" onClick={() => exportOne(t, g.label)} title="Download just this task as a .txt file">
                            Export
                          </button>
                          {viewingSelf && (
                            <>
                              <button className="btn ghost sm" onClick={() => setEditing(t)}>Edit</button>
                              <button className="btn danger sm" onClick={() => remove(t._id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                      {isOpen && (total > 0 || macros.length > 0) && (
                        <div style={{ padding: viewingSelf ? '0 18px 12px 70px' : '0 18px 12px 54px' }}>
                          {total > 0 && (
                            <ChecklistView
                              items={checklist}
                              readOnly={!viewingSelf}
                              canVerify={!viewingSelf && !!t.needsVerification}
                              storageKey={t._id}
                              verify={!!t.needsVerification}
                              onToggle={(itemId, box) => toggleChecklistItem(t, itemId, box)}
                            />
                          )}
                          {macros.length > 0 && <MacroListView macros={macros} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
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
