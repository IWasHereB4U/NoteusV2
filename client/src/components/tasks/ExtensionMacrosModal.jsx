import { useEffect, useRef, useState } from 'react';
import { Modal, FormModal } from '../Modal.jsx';
import {
  detectExtension, sendToExtension, listExtensionMacros, macrosFromFile, downloadMacro,
} from '../../utils/formMacros.js';

const STEP_LABEL = {
  click: 'Click', fill: 'Fill', select: 'Choose', check: 'Check', key: 'Key', waitFor: 'Wait for', wait: 'Wait',
};

// The Form Macros library: macros for the browser extension, kept in NoteUs.
// Each one can be downloaded as a file or sent straight into the extension
// when it's installed. Files (or the extension's own macros) can be
// uploaded here; a macro with the same name + URL pattern is updated rather
// than duplicated, same rule the extension uses.
export function ExtensionMacrosModal({ macros, canEdit, onUpsert, onUpdate, onDelete, onClose }) {
  const [ext, setExt] = useState(undefined); // undefined = checking, null = not installed, string = version
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [flash, setFlash] = useState(null); // { kind: 'ok' | 'err', text }
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pull, setPull] = useState(null); // { items, picked: Set<index> } when choosing from the extension
  const fileRef = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    detectExtension().then((v) => alive && setExt(v));
    return () => { alive = false; clearTimeout(flashTimer.current); };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = macros.filter((m) => `${m.name} ${m.match} ${m.note || ''}`.toLowerCase().includes(q));

  function say(kind, text) {
    setFlash({ kind, text });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 5000);
  }

  function toggleOpen(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function sendMany(list, key) {
    setBusy(key);
    try {
      const r = await sendToExtension(list);
      say('ok', `Sent to extension: ${r.added} new, ${r.updated} updated.`);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadFiles(files) {
    const found = [];
    const bad = [];
    for (const f of files) {
      try {
        const list = macrosFromFile(JSON.parse(await f.text()));
        if (!list.length) throw new Error();
        found.push(...list);
      } catch {
        bad.push(f.name);
      }
    }
    if (!found.length) return say('err', `No valid macros in ${bad.join(', ')}`);
    setBusy('upload');
    try {
      const r = await onUpsert(found);
      say(bad.length ? 'err' : 'ok',
        `Uploaded: ${r.added} new, ${r.updated} updated${bad.length ? ` · skipped ${bad.join(', ')}` : ''}`);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  async function startPull() {
    setBusy('pull');
    try {
      const items = await listExtensionMacros();
      if (!items.length) return say('err', 'The extension has no macros yet.');
      setPull({ items, picked: new Set(items.map((_, i) => i)) });
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  async function savePulled() {
    const chosen = pull.items.filter((_, i) => pull.picked.has(i));
    if (!chosen.length) return;
    setBusy('pull-save');
    try {
      const r = await onUpsert(chosen);
      say('ok', `Saved from extension: ${r.added} new, ${r.updated} updated.`);
      setPull(null);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  const extReady = typeof ext === 'string';

  return (
    <>
      <Modal title="Extension macros" onClose={onClose} width={760}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="field"
            placeholder="Search macros…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          {canEdit && (
            <>
              <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}>
                ⤒ Upload file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                onChange={(e) => { if (e.target.files.length) uploadFiles([...e.target.files]); e.target.value = ''; }}
              />
              <button
                className="btn ghost"
                onClick={startPull}
                disabled={!extReady || busy === 'pull'}
                title={extReady ? 'Pick macros from your extension to save here' : 'Form Macros extension not detected'}
              >
                {busy === 'pull' ? 'Waiting…' : '⇠ From extension'}
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className={`tag ${extReady ? 'green' : 'ochre'}`}>
            {ext === undefined ? 'Checking for extension…' : extReady ? `Extension connected · v${ext}` : 'Extension not detected'}
          </span>
          {extReady && macros.length > 1 && (
            <button className="btn ghost sm" onClick={() => sendMany(shown, 'all')} disabled={busy === 'all' || !shown.length}>
              {busy === 'all' ? 'Sending…' : `Send ${q ? 'shown' : 'all'} to extension (${shown.length})`}
            </button>
          )}
        </div>

        {flash && (
          <div
            className="card"
            style={{
              padding: '8px 12px', marginBottom: 12, fontSize: 13, boxShadow: 'none',
              background: flash.kind === 'ok' ? 'var(--teal-t)' : 'var(--coral-t)',
              color: flash.kind === 'ok' ? 'var(--teal)' : 'var(--coral)',
            }}
          >
            {flash.text}
          </div>
        )}

        {pull && (
          <div className="card" style={{ marginBottom: 14, boxShadow: 'none' }}>
            <div className="card-h">
              <h2>From extension · pick what to save</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setPull(null)}>Cancel</button>
                <button className="btn sm" onClick={savePulled} disabled={!pull.picked.size || busy === 'pull-save'}>
                  {busy === 'pull-save' ? 'Saving…' : `Save ${pull.picked.size}`}
                </button>
              </div>
            </div>
            <div className="stack" style={{ maxHeight: 240, overflow: 'auto' }}>
              {pull.items.map((m, i) => (
                <label key={i} className="row" style={{ gridTemplateColumns: '24px 1fr auto', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pull.picked.has(i)}
                    onChange={() => setPull((p) => {
                      const picked = new Set(p.picked);
                      picked.has(i) ? picked.delete(i) : picked.add(i);
                      return { ...p, picked };
                    })}
                  />
                  <span style={{ fontWeight: 600 }} className="truncate">{m.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{m.steps.length} steps</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {macros.length === 0 ? (
          <div className="empty">
            <b>No extension macros yet</b>
            Upload a <code>.formmacro.json</code> exported from the Form Macros extension
            {extReady ? ', or pull them straight from the extension' : ''}.
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">No macros match “{query}”.</div>
        ) : (
          <div className="stack" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
            {shown.map((m) => {
              const isOpen = open.has(m._id);
              return (
                <div key={m._id}>
                  <div className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="checklist-toggle" onClick={() => toggleOpen(m._id)}>
                          {isOpen ? '▾' : '▸'} {m.steps.length} step{m.steps.length === 1 ? '' : 's'}
                        </button>
                        <span className="truncate" style={{ maxWidth: 260, fontFamily: 'var(--mono)', fontSize: 11 }} title={m.match}>
                          {m.match}
                        </span>
                        {m.note && <span className="truncate" style={{ maxWidth: 220 }}>{m.note}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        className="btn sm"
                        onClick={() => sendMany([m], m._id)}
                        disabled={!extReady || busy === m._id}
                        title={extReady ? 'Add or update this macro in your Form Macros extension' : 'Install the Form Macros extension to import directly'}
                      >
                        {busy === m._id ? 'Sending…' : '⇢ Import to extension'}
                      </button>
                      <button className="btn ghost sm" onClick={() => downloadMacro(m)} title="Download as .formmacro.json">
                        ⤓ Download
                      </button>
                      {canEdit && (
                        <>
                          <button className="btn ghost sm" onClick={() => setEditing(m)}>Edit</button>
                          <button className="btn danger sm" onClick={() => onDelete(m)}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <ol style={{ margin: 0, padding: '0 18px 12px 38px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {m.steps.map((s, i) => (
                        <li key={i} style={{ padding: '2px 0' }}>
                          {s.manual && (
                            <span className="tag ochre" style={{ marginRight: 6 }} title="Asks for the value while the macro runs">
                              manual
                            </span>
                          )}
                          <b>{STEP_LABEL[s.type] || s.type}</b>{' '}
                          {s.selector && <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{s.selector}</code>}
                          {s.value && <span style={{ color: 'var(--ink3)' }}> → {s.manual ? `default ${s.value}` : s.value}</span>}
                          {s.labelSelector && (
                            <span style={{ color: 'var(--ink3)' }}> · label <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{s.labelSelector}</code></span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {editing && (
        <FormModal
          title="Edit macro"
          initial={editing}
          fields={[
            { k: 'name', label: 'Name', required: true },
            { k: 'match', label: 'Runs on (URL pattern, * is a wildcard)', placeholder: 'https://example.com/*' },
            { k: 'note', label: 'Note', type: 'textarea', placeholder: 'What this macro does, when to use it…' },
          ]}
          onSubmit={(values) => onUpdate(editing._id, values)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
