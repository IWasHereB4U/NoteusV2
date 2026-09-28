import { useEffect, useRef, useState } from 'react';
import {
  detectExtensionOnce, sendToExtension, listExtensionMacros, macrosFromFile, downloadMacro,
} from '../../utils/formMacros.js';
import { newItemId } from './checklist.js';

// Macros for the Form Macros browser extension, attached to a task or a
// task instance. Stored on the task as [{ id, name, match, steps }].
// Steps are built in the extension; NoteUs keeps, shares and hands them back.

const STEP_LABEL = {
  click: 'Click', fill: 'Fill', select: 'Choose', check: 'Check', key: 'Key', waitFor: 'Wait for', wait: 'Wait',
};

function useExtension() {
  const [version, setVersion] = useState(undefined); // undefined = checking, null = missing
  useEffect(() => {
    let alive = true;
    detectExtensionOnce().then((v) => alive && setVersion(v));
    return () => { alive = false; };
  }, []);
  return version;
}

function useFlash() {
  const [flash, setFlash] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (kind, text) => {
    setFlash({ kind, text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 5000);
  };
  const node = flash && <div className={`macro-flash ${flash.kind}`}>{flash.text}</div>;
  return [say, node];
}

function StepList({ steps }) {
  return (
    <ol className="macro-steps">
      {steps.map((s, i) => (
        <li key={i}>
          {s.manual && <span className="tag ochre" title="Asks for the value while the macro runs">manual</span>}{' '}
          <b>{STEP_LABEL[s.type] || s.type}</b>{' '}
          {s.selector && <code>{s.selector}</code>}
          {s.value && <span className="dim"> → {s.manual ? `default ${s.value}` : s.value}</span>}
          {s.labelSelector && <span className="dim"> · label <code>{s.labelSelector}</code></span>}
        </li>
      ))}
    </ol>
  );
}

function MacroRow({ macro, ext, busy, onSend, children }) {
  const [open, setOpen] = useState(false);
  const extReady = typeof ext === 'string';
  return (
    <div className="macro-row">
      <div className="macro-main">
        <span className="macro-icon" aria-hidden>⚡</span>
        <div className="macro-info">
          {children || <div className="macro-name">{macro.name}</div>}
          <div className="macro-meta">
            <button type="button" className="checklist-toggle" onClick={() => setOpen((o) => !o)}>
              {open ? '▾' : '▸'} {macro.steps.length} step{macro.steps.length === 1 ? '' : 's'}
            </button>
            <span className="truncate macro-match" title={macro.match}>{macro.match}</span>
          </div>
        </div>
        <div className="macro-actions">
          <button
            type="button"
            className="btn sm"
            onClick={onSend}
            disabled={!extReady || busy}
            title={extReady ? 'Add or update this macro in your Form Macros extension' : 'Form Macros extension not detected'}
          >
            {busy ? 'Sending…' : '⇢ Extension'}
          </button>
          <button type="button" className="btn ghost sm" onClick={() => downloadMacro(macro)} title="Download as .formmacro.json">
            ⤓
          </button>
        </div>
      </div>
      {open && <StepList steps={macro.steps} />}
    </div>
  );
}

// Shown on a task in the list, under its checklist.
export function MacroListView({ macros }) {
  const ext = useExtension();
  const [busy, setBusy] = useState(null);
  const [say, flashNode] = useFlash();

  async function send(list, key) {
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

  return (
    <div className="macro-list">
      <div className="macro-head">
        <span>Macros</span>
        {ext === null && <span className="dim">· extension not detected</span>}
        {typeof ext === 'string' && macros.length > 1 && (
          <button type="button" className="btn ghost sm" onClick={() => send(macros, 'all')} disabled={busy === 'all'}>
            {busy === 'all' ? 'Sending…' : `Send all ${macros.length} to extension`}
          </button>
        )}
      </div>
      {flashNode}
      {macros.map((m) => (
        <MacroRow key={m.id} macro={m} ext={ext} busy={busy === m.id} onSend={() => send([m], m.id)} />
      ))}
    </div>
  );
}

// Used inside the task / instance editor: upload files, pull from the
// extension, rename or remove. A macro with the same name + URL pattern
// as one already on this task replaces its steps (the extension's rule).
export function MacroListEditor({ macros, onChange }) {
  const ext = useExtension();
  const extReady = typeof ext === 'string';
  const fileRef = useRef(null);
  const [say, flashNode] = useFlash();
  const [busy, setBusy] = useState(null);
  const [pull, setPull] = useState(null); // { items, picked: Set<index> }

  function merge(incoming) {
    const next = macros.slice();
    let added = 0;
    let updated = 0;
    for (const m of incoming) {
      const i = next.findIndex((x) => x.name === m.name && x.match === m.match);
      const clean = { name: m.name, match: m.match, steps: m.steps };
      if (i >= 0) { next[i] = { ...next[i], steps: clean.steps }; updated++; }
      else { next.push({ ...clean, id: newItemId() }); added++; }
    }
    onChange(next);
    return `${added} added, ${updated} updated`;
  }

  async function upload(files) {
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
    say(bad.length ? 'err' : 'ok', `Uploaded: ${merge(found)}${bad.length ? ` · skipped ${bad.join(', ')}` : ''}. Save to keep.`);
  }

  async function startPull() {
    setBusy('pull');
    try {
      const items = await listExtensionMacros();
      if (!items.length) return say('err', 'The extension has no macros yet.');
      setPull({ items, picked: new Set() });
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  async function send(m) {
    setBusy(m.id);
    try {
      const r = await sendToExtension([m]);
      say('ok', `Sent to extension: ${r.added} new, ${r.updated} updated.`);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusy(null);
    }
  }

  const rename = (id, name) => onChange(macros.map((m) => (m.id === id ? { ...m, name } : m)));
  const remove = (id) => onChange(macros.filter((m) => m.id !== id));

  return (
    <div className="macro-list editing">
      {macros.length === 0 && !pull && (
        <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>
          No macros yet. Export one from the Form Macros extension and upload it, or pull it straight from the extension.
        </div>
      )}

      {macros.map((m) => (
        <MacroRow key={m.id} macro={m} ext={ext} busy={busy === m.id} onSend={() => send(m)}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="field sm"
              value={m.name}
              onChange={(e) => rename(m.id, e.target.value)}
              placeholder="Macro name"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="button" className="btn danger sm" onClick={() => remove(m.id)} title="Remove from this task">×</button>
          </div>
        </MacroRow>
      ))}

      {pull && (
        <div className="macro-pull">
          <div className="macro-head">
            <span>From extension · tick what to add</span>
            <button type="button" className="btn ghost sm" onClick={() => setPull(null)}>Cancel</button>
            <button
              type="button"
              className="btn sm"
              disabled={!pull.picked.size}
              onClick={() => {
                const res = merge(pull.items.filter((_, i) => pull.picked.has(i)));
                setPull(null);
                say('ok', `From extension: ${res}. Save to keep.`);
              }}
            >
              Add {pull.picked.size || ''}
            </button>
          </div>
          {pull.items.map((m, i) => (
            <label key={i} className="checklist-view-row">
              <input
                type="checkbox"
                checked={pull.picked.has(i)}
                onChange={() => setPull((p) => {
                  const picked = new Set(p.picked);
                  picked.has(i) ? picked.delete(i) : picked.add(i);
                  return { ...p, picked };
                })}
              />
              <span>{m.name} <span className="dim">· {m.steps.length} steps · {m.match}</span></span>
            </label>
          ))}
        </div>
      )}

      {flashNode}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>⤒ Upload file</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => { if (e.target.files.length) upload([...e.target.files]); e.target.value = ''; }}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={startPull}
          disabled={!extReady || busy === 'pull' || !!pull}
          title={extReady ? 'Pick macros from your Form Macros extension' : 'Form Macros extension not detected'}
        >
          {busy === 'pull' ? 'Waiting…' : '⇠ From extension'}
        </button>
        <span className="dim" style={{ fontSize: 11 }}>
          {ext === undefined ? 'Checking for extension…' : extReady ? `Extension v${ext} connected` : 'Extension not detected'}
        </span>
      </div>
    </div>
  );
}
