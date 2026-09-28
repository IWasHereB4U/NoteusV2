import { useId, useState } from 'react';
import { Modal } from '../Modal.jsx';
import { ChecklistEditor } from './Checklist.jsx';
import { MacroListEditor } from './MacroList.jsx';
import { cloneFresh, newItemId, normalizeLink, pruneEmpty } from './checklist.js';
import { cloneMacros } from '../../utils/formMacros.js';

// One editor for both a Task and a Task Instance — they share name, link,
// note and the nested checklist. mode="task" adds the task-only fields
// (client, due date, priority) and, for a new task, a "Start from
// instance" picker that pre-fills the form with a fresh copy of one.
export function TaskEditorModal({ mode, initial = {}, clients = [], instances = [], onSubmit, onClose }) {
  const isTask = mode === 'task';
  const uid = useId();
  const fid = (k) => `${uid}-${k}`;
  const [values, setValues] = useState({
    name: (isTask ? initial.title : initial.name) || '',
    link: initial.link || '',
    note: initial.note || '',
    checklist: initial.checklist || [],
    macros: initial.macros || [],
    clientId: initial.clientId || '',
    due: initial.due || '',
    priority: initial.priority || 'normal',
    fromInstance: initial.fromInstance || null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  function startFrom(instanceId) {
    const inst = instances.find((i) => i._id === instanceId);
    if (!inst) return set('fromInstance', null);
    setValues((s) => ({
      ...s,
      name: inst.name,
      link: inst.link || '',
      note: inst.note || '',
      checklist: cloneFresh(inst.checklist),
      macros: cloneMacros(inst.macros, newItemId),
      fromInstance: inst._id,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!values.name.trim()) return setError(isTask ? 'Task name is required' : 'Instance name is required');
    setSaving(true);
    setError('');
    try {
      const common = {
        link: normalizeLink(values.link),
        note: values.note,
        checklist: pruneEmpty(values.checklist),
        macros: values.macros.map((m) => ({ ...m, name: (m.name || '').trim() || 'Untitled macro' })),
      };
      await onSubmit(
        isTask
          ? {
              ...common,
              title: values.name.trim(),
              clientId: values.clientId || null,
              due: values.due,
              priority: values.priority,
              fromInstance: values.fromInstance,
            }
          : { ...common, name: values.name.trim() }
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const title = isTask ? (initial._id ? 'Edit task' : 'Add task') : initial._id ? 'Edit task instance' : 'New task instance';

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="task-editor-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="task-editor-form" onSubmit={submit}>
        {isTask && !initial._id && instances.length > 0 && (
          <div className="field-row">
            <label htmlFor={fid('from')}>Start from a task instance (optional)</label>
            <select id={fid('from')} className="field" value={values.fromInstance || ''} onChange={(e) => startFrom(e.target.value)}>
              <option value="">— Blank task —</option>
              {instances.map((i) => (
                <option key={i._id} value={i._id}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <label htmlFor={fid('name')}>{isTask ? 'Task name' : 'Instance name'}</label>
          <input id={fid('name')} className="field" value={values.name} onChange={(e) => set('name', e.target.value)} autoFocus required />
        </div>

        <div className="field-row">
          <label htmlFor={fid('link')}>Task link (optional)</label>
          <input
            id={fid('link')} className="field"
            value={values.link}
            onChange={(e) => set('link', e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="field-row">
          <label htmlFor={fid('note')}>Task note (optional)</label>
          <textarea id={fid('note')} className="field" rows={3} value={values.note} onChange={(e) => set('note', e.target.value)} />
        </div>

        {isTask && (
          <div className="field-grid">
            <div className="field-row">
              <label htmlFor={fid('client')}>Client (optional)</label>
              <select id={fid('client')} className="field" value={values.clientId} onChange={(e) => set('clientId', e.target.value)}>
                <option value="">No client — general task</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <label htmlFor={fid('due')}>Due date</label>
              <input id={fid('due')} className="field" type="date" value={values.due} onChange={(e) => set('due', e.target.value)} />
            </div>
            <div className="field-row">
              <label htmlFor={fid('priority')}>Priority</label>
              <select id={fid('priority')} className="field" value={values.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        )}

        <div className="field-row">
          <label>Checklist</label>
          <ChecklistEditor items={values.checklist} onChange={(v) => set('checklist', v)} />
        </div>

        <div className="field-row">
          <label>Extension macros</label>
          <MacroListEditor macros={values.macros} onChange={(v) => set('macros', v)} />
        </div>
      </form>
    </Modal>
  );
}
