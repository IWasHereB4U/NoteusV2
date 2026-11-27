import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  newItem, toggleItem, updateText, removeItem, addChild, insertAfter, indentItem, outdentItem,
  countItems, parentIds, ancestorIds, toggleVerifyBox, verifyStatus, wrapInParent,
  patchItem, findItem, moveItem, shiftItem, normalizeLink, safeHref, linkTarget, linkLabel, REPO_KINDS,
} from './checklist.js';
import { useCollapsed } from '../../hooks/useCollapsed.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { filesApi, toAttachment, fileSrc } from '../../api/files.js';
import { FilePickerModal } from '../files/FilePickerModal.jsx';

function FoldBar({ hasParents, allCollapsed, onCollapseAll, onExpandAll }) {
  if (!hasParents) return null;
  return (
    <div className="checklist-foldbar">
      <button type="button" className="checklist-fold-link" onClick={allCollapsed ? onExpandAll : onCollapseAll}>
        {allCollapsed ? '▸ Expand all' : '▾ Collapse all'}
      </button>
    </div>
  );
}

// Turns web addresses typed inside an item's text into clickable links.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
function Linkified({ text }) {
  return String(text || '').split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part; // odd entries are the URL matches
    const m = /^(.*?)([.,;:!?)\]]*)$/.exec(part);
    return (
      <Fragment key={i}>
        <a className="checklist-inline-link" href={m[1]} target="_blank" rel="noopener noreferrer">{m[1]}</a>
        {m[2]}
      </Fragment>
    );
  });
}

// A picture on a checklist item. Click opens it full size in a new tab.
function ItemImage({ image, small = false }) {
  const src = fileSrc(image);
  return (
    <a className={`checklist-img-wrap${small ? ' small' : ''}`} href={src} target="_blank" rel="noopener noreferrer" title={image.name}>
      <img className="checklist-img" src={src} alt={image.name || 'Picture'} loading="lazy" />
    </a>
  );
}

// A link on a checklist item: web links open a new tab; repository links
// navigate inside the app to the File repository, already filtered.
function ItemLink({ link }) {
  const href = linkTarget(link);
  if (!href) return null;
  const label = linkLabel(link);
  if (link.type === 'repo') {
    return (
      <Link className="checklist-link repo" to={href} title="Open in the File repository">
        <span aria-hidden="true">🗂️</span><span className="checklist-link-text">{label}</span>
      </Link>
    );
  }
  return (
    <a className="checklist-link" href={href} target="_blank" rel="noopener noreferrer" title={href}>
      <span aria-hidden="true">🔗</span><span className="checklist-link-text">{label}</span>
    </a>
  );
}

function ItemExtras({ item, indent }) {
  const hasLink = item.link && linkTarget(item.link);
  if (!item.image && !hasLink) return null;
  return (
    <div className="checklist-extras" style={{ paddingLeft: indent }}>
      {item.image && <ItemImage image={item.image} />}
      {hasLink && <ItemLink link={item.link} />}
    </div>
  );
}

const VERIFY_LABEL = { red: 'Not started', yellow: 'One check done', green: 'Fully verified' };

// The pair of tick boxes shown on every item when a task needs verification.
// `disabled` locks both boxes. `lockFirst` locks only the first one — used when
// someone else in the circle is looking at the owner's task: they may tick the
// second box (to confirm), but never the owner's first one.
function VerifyBoxes({ item, disabled, lockFirst, onToggle }) {
  const status = verifyStatus(item);
  const by = item.check2By;
  const secondTitle = item.check2 && by?.name ? `Verified by ${by.name}` : 'Second check';
  return (
    <span className={`verify-boxes ${status}`} title={VERIFY_LABEL[status]}>
      <input
        type="checkbox"
        checked={!!item.check1}
        disabled={disabled || lockFirst}
        onChange={() => onToggle('check1')}
        aria-label="First check"
        title="First check"
      />
      <input
        type="checkbox"
        checked={!!item.check2}
        disabled={disabled}
        onChange={() => onToggle('check2')}
        aria-label="Second check"
        title={secondTitle}
      />
    </span>
  );
}

// Small inline form for an item's link: either a web address, or a link that
// opens the File repository filtered by name / kind / one particular file.
function LinkEditor({ link, onApply, onRemove, onCancel }) {
  const [type, setType] = useState(link?.type === 'repo' ? 'repo' : 'url');
  const [href, setHref] = useState(link?.type === 'url' ? link.href || '' : '');
  const [label, setLabel] = useState(link?.label || '');
  const [q, setQ] = useState(link?.type === 'repo' ? link.q || '' : '');
  const [kind, setKind] = useState(link?.type === 'repo' ? link.kind || '' : '');
  const [fileId, setFileId] = useState(link?.type === 'repo' ? link.fileId || '' : '');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  function apply() {
    const lab = label.trim() ? { label: label.trim() } : {};
    if (type === 'url') {
      const value = normalizeLink(href);
      if (!value) return setError('Type a web address first.');
      if (!safeHref(value)) return setError('Only http(s), mailto: and tel: links are allowed.');
      return onApply({ type: 'url', href: value, ...lab });
    }
    if (!q.trim() && !kind && !fileId) return setError('Type a name to search for, choose a kind, or pick a file.');
    return onApply({
      type: 'repo',
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(kind ? { kind } : {}),
      ...(fileId ? { fileId } : {}),
      ...lab,
    });
  }

  // This sits inside the task's <form>, so Enter must not submit the task.
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };

  return (
    <div className="checklist-panel">
      <div className="checklist-panel-tabs">
        <button type="button" className={`btn sm ${type === 'url' ? '' : 'ghost'}`} onClick={() => setType('url')}>🔗 Web link</button>
        <button type="button" className={`btn sm ${type === 'repo' ? '' : 'ghost'}`} onClick={() => setType('repo')}>🗂️ File repository</button>
      </div>
      {type === 'url' ? (
        <input className="field sm" value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={onKey} placeholder="https://…" autoFocus />
      ) : (
        <>
          <div className="checklist-panel-row">
            <input
              className="field sm" value={q} placeholder="File name contains…" onKeyDown={onKey} autoFocus
              onChange={(e) => { setQ(e.target.value); setFileId(''); }}
            />
            <select className="field sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of file">
              {REPO_KINDS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
            <button type="button" className="btn ghost sm" onClick={() => setPicking(true)}>Pick a file…</button>
          </div>
          <div className="checklist-panel-hint">
            {fileId
              ? 'Opens the File repository showing just that file.'
              : 'Opens the File repository, filtered by what you set above.'}
          </div>
        </>
      )}
      <input className="field sm" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={onKey} placeholder="Link text (optional)" />
      {error && <div className="checklist-panel-error">{error}</div>}
      <div className="checklist-panel-row">
        <button type="button" className="btn sm" onClick={apply}>{link ? 'Update link' : 'Add link'}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
        {link && <button type="button" className="btn danger sm" onClick={onRemove} style={{ marginLeft: 'auto' }}>Remove link</button>}
      </div>
      {picking && createPortal(
        <FilePickerModal
          single
          title="Pick a file to link to"
          actionLabel="Link to this file"
          onPick={([f]) => { if (f) { setQ(f.originalName); setKind(''); setFileId(String(f._id)); } }}
          onClose={() => setPicking(false)}
        />,
        document.body
      )}
    </div>
  );
}

// The repository entry -> the compact picture record an item keeps.
const imageOf = (file) => {
  const { id, ...rest } = toAttachment(file);
  return rest;
};

function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// Editable nested checklist, used inside the task and instance editors.
//
// Keyboard: Enter adds a sibling below, Tab (or → at the end of the text)
// nests the item under the one above it, Shift+Tab (or ← at the start)
// moves it back out, Backspace on an empty item
// removes it. The buttons do the same for anyone not using the keyboard.
// With `verify` on, each item shows two tick boxes and a red/yellow/green row.
//
// Each item can also carry a picture (uploaded, or picked from the File
// repository) and a link (web address, or a shortcut into the File repository).
// Items are re-ordered by dragging their ⋮⋮ handle up or down (mouse or touch);
// with the handle focused, ↑ / ↓ move the item too.
export function ChecklistEditor({ items, onChange, verify = false }) {
  const inputs = useRef({});
  const { user } = useAuth();
  // Who is ticking the second box (recorded on the item as "verified by").
  const whoTicked = () => ({ id: user?.id, name: user?.name, at: new Date().toISOString() });
  const [focusId, setFocusId] = useState(null);
  // Folding in the editor is per-session only (no point remembering it).
  const { collapsed, toggle: toggleFold, setAll: setFolded, remove: unfold } = useCollapsed(null);
  const parents = parentIds(items);

  // The latest list, for async work (uploads) that finishes after more edits.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const rootRef = useRef(null);

  // Make sure an item is visible by unfolding everything above it.
  function reveal(next, id) {
    const up = ancestorIds(next, id);
    if (up && up.length) unfold(up);
  }

  const caretAt = useRef(null); // where to put the cursor after a re-parent
  useEffect(() => {
    const el = focusId && inputs.current[focusId];
    if (el) {
      el.focus();
      if (caretAt.current != null) {
        try { el.setSelectionRange(caretAt.current, caretAt.current); } catch { /* not a text input */ }
        caretAt.current = null;
      }
      setFocusId(null);
    }
  }, [focusId, items]);

  // --- pictures & links ----------------------------------------------------
  const fileInput = useRef(null);
  const uploadTarget = useRef(null); // item the chosen file(s) go onto (null = new items)
  const [panel, setPanel] = useState(null); // { id: string|null, kind: 'image' | 'link' }
  const [picking, setPicking] = useState(null); // { id: string|null }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // First picture goes on `targetId` (replacing any), extras become new items
  // right after it. With no target, every picture becomes a new item at the end.
  function attachImages(images, targetId) {
    if (!images.length) return;
    let next = itemsRef.current;
    let anchor = targetId;
    let rest = images;
    if (targetId && findItem(next, targetId)) {
      next = patchItem(next, targetId, { image: images[0] });
      rest = images.slice(1);
    } else {
      anchor = null;
    }
    for (const image of rest) {
      const it = newItem('', { image });
      next = anchor ? insertAfter(next, anchor, it) : [...next, it];
      anchor = it.id;
    }
    onChange(next);
    if (targetId) reveal(next, targetId);
  }

  async function uploadImages(fileList, targetId) {
    const all = [...(fileList || [])];
    const files = all.filter((f) => (f.type || '').startsWith('image/'));
    if (!files.length) { if (all.length) setError('Only picture files can be added here.'); return; }
    setBusy(true);
    setError('');
    const added = [];
    try {
      for (const f of files) added.push(imageOf(await filesApi.upload(f)));
    } catch (err) {
      setError(`${err.message || 'Upload failed'}${added.length ? ` (${added.length} of ${files.length} added)` : ''}`);
    } finally {
      attachImages(added, targetId);
      setBusy(false);
      setPanel(null);
    }
  }

  function chooseUpload(targetId) {
    uploadTarget.current = targetId;
    fileInput.current?.click();
  }

  function addRoot() {
    const it = newItem();
    onChange([...items, it]);
    setFocusId(it.id);
  }

  function addSub(parentId) {
    const it = newItem();
    const next = addChild(items, parentId, it);
    onChange(next);
    reveal(next, it.id);
    setFocusId(it.id);
  }

  // Adds a new item in this item's place and moves this item under it.
  function addParent(id) {
    const it = newItem();
    const next = wrapInParent(items, id, it);
    onChange(next);
    reveal(next, it.id);
    setFocusId(it.id);
  }

  function indent(id) {
    const next = indentItem(items, id);
    onChange(next);
    reveal(next, id);
  }

  // --- drag to re-order ----------------------------------------------------
  // Pointer events (not HTML5 drag-and-drop) so it works with a finger too.
  const dragRef = useRef(null); // { id, y, over }
  const [drag, setDrag] = useState(null); // { id, over: { id, pos } | null }
  const [focusHandle, setFocusHandle] = useState(null);
  const handles = useRef({});

  useEffect(() => {
    const el = focusHandle && handles.current[focusHandle];
    if (el) { el.focus(); setFocusHandle(null); }
  }, [focusHandle, items]);

  // While dragging, nudge the dialog's scroll when the pointer nears its edge.
  useEffect(() => {
    if (!drag) return undefined;
    const sc = scrollParent(rootRef.current);
    if (!sc) return undefined;
    const timer = setInterval(() => {
      const d = dragRef.current;
      if (!d) return;
      const r = sc.getBoundingClientRect();
      if (d.y < r.top + 48) sc.scrollTop -= 14;
      else if (d.y > r.bottom - 48) sc.scrollTop += 14;
    }, 30);
    return () => clearInterval(timer);
  }, [drag?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function beginDrag(e, id) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    dragRef.current = { id, y: e.clientY, over: null };
    setDrag({ id, over: null });
  }

  function moveDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    d.y = e.clientY;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const head = el?.closest?.('[data-item-id]');
    let over = null;
    if (head && rootRef.current?.contains(head)) {
      const tid = head.getAttribute('data-item-id');
      const dragged = findItem(itemsRef.current, d.id);
      // Can't drop an item on itself or inside its own sub-items.
      if (tid !== d.id && !findItem(dragged?.children || [], tid)) {
        const r = head.getBoundingClientRect();
        over = { id: tid, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' };
      }
    }
    d.over = over;
    setDrag((s) => (s && s.over?.id === over?.id && s.over?.pos === over?.pos ? s : s && { ...s, over }));
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d?.over) return;
    const list = itemsRef.current;
    const target = findItem(list, d.over.id);
    const kids = target?.children || [];
    let next;
    if (d.over.pos === 'after' && kids.length && !collapsed.has(target.id)) {
      // Lower half of an open parent: the item lands as its first sub-item,
      // which is where the drop line is drawn.
      next = moveItem(list, d.id, kids[0].id, 'before');
    } else {
      next = moveItem(list, d.id, d.over.id, d.over.pos);
    }
    if (next === list) return;
    onChange(next);
    reveal(next, d.id);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  function onHandleKey(e, id) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(shiftItem(items, id, e.key === 'ArrowUp' ? -1 : 1));
      setFocusHandle(id);
    }
  }

  function onKeyDown(e, item) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const it = newItem();
      onChange(insertAfter(items, item.id, it));
      setFocusId(it.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey ? outdentItem(items, item.id) : indentItem(items, item.id);
      onChange(next);
      reveal(next, item.id);
      setFocusId(item.id);
    } else if (
      (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
      !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.nativeEvent.isComposing
    ) {
      // Arrow keys re-parent the item, but only once the cursor has hit the
      // edge of the text — so you can still move through what you typed.
      // → at the end nests it under the item above; ← at the start moves it
      // out one level. A new/empty item is at both edges, so it works at once.
      const input = e.target;
      const { selectionStart: a, selectionEnd: b, value } = input;
      if (a !== b) return;
      if (e.key === 'ArrowRight' && a === value.length) {
        e.preventDefault();
        const next = indentItem(items, item.id);
        onChange(next);
        reveal(next, item.id);
        caretAt.current = a;
        setFocusId(item.id);
      } else if (e.key === 'ArrowLeft' && a === 0) {
        e.preventDefault();
        const next = outdentItem(items, item.id);
        onChange(next);
        reveal(next, item.id);
        caretAt.current = a;
        setFocusId(item.id);
      }
    } else if (e.key === 'Backspace' && !item.text && !item.image && !item.link && !(item.children || []).length) {
      e.preventDefault();
      onChange(removeItem(items, item.id));
    }
  }

  // The picture / link controls shown under an item's row (or under the list,
  // for "+ Add picture", where id is null).
  function renderPanel(id) {
    if (!panel || panel.id !== id) return null;
    if (panel.kind === 'image') {
      return (
        <div className="checklist-panel">
          <div className="checklist-panel-row">
            <button type="button" className="btn sm" disabled={busy} onClick={() => chooseUpload(id)}>⬆ Upload picture</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setPicking({ id }); setPanel(null); }}>🗂️ From repository</button>
            <button type="button" className="btn ghost sm" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </div>
      );
    }
    const item = findItem(items, id);
    return (
      <LinkEditor
        link={item?.link}
        onApply={(link) => { onChange(patchItem(items, id, { link })); setPanel(null); }}
        onRemove={() => { onChange(patchItem(items, id, { link: null })); setPanel(null); }}
        onCancel={() => setPanel(null)}
      />
    );
  }

  function renderList(list, depth) {
    return list.map((item) => {
      const kids = item.children || [];
      const isFolded = kids.length > 0 && collapsed.has(item.id);
      const over = drag?.over?.id === item.id ? drag.over.pos : null;
      const pad = depth * 22;
      const extraPad = pad + (verify ? 62 : 44);
      return (
      <div key={item.id} className={`checklist-edit-block${drag?.id === item.id ? ' dragging' : ''}`}>
        <div className={`checklist-edit-item${over ? ` drop-${over}` : ''}`} data-item-id={item.id}>
        <div
          className={`checklist-edit-row${verify ? ` verify-row ${verifyStatus(item)}` : ''}`}
          style={{ paddingLeft: pad }}
        >
          <button
            type="button"
            className="checklist-drag"
            ref={(el) => (handles.current[item.id] = el)}
            title="Drag up or down to re-order (or focus and press ↑ / ↓)"
            aria-label="Re-order this item"
            onPointerDown={(e) => beginDrag(e, item.id)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onKeyDown={(e) => onHandleKey(e, item.id)}
          >
            ⋮⋮
          </button>
          {kids.length > 0 ? (
            <button
              type="button"
              className="checklist-caret"
              onClick={() => toggleFold(item.id)}
              title={isFolded ? 'Show sub-items' : 'Hide sub-items'}
              aria-expanded={!isFolded}
            >
              {isFolded ? '▸' : '▾'}
            </button>
          ) : (
            <span className="checklist-caret spacer" />
          )}
          {verify ? (
            <VerifyBoxes item={item} onToggle={(key) => onChange(toggleVerifyBox(items, item.id, key, whoTicked()))} />
          ) : (
            <input
              type="checkbox"
              checked={!!item.done}
              onChange={() => onChange(toggleItem(items, item.id))}
              title="Tick"
            />
          )}
          <input
            ref={(el) => (inputs.current[item.id] = el)}
            className="field sm"
            value={item.text}
            placeholder={item.image ? 'Caption (optional)' : depth ? 'Sub-item' : 'Checklist item'}
            onChange={(e) => onChange(updateText(items, item.id, e.target.value))}
            onKeyDown={(e) => onKeyDown(e, item)}
          />
          {isFolded && (
            <span className="checklist-sub-count" title="Hidden sub-items (done/total)">
              {(() => { const c = countItems(kids); return `${c.done}/${c.total}`; })()}
            </span>
          )}
          <button
            type="button"
            className={`btn sm ${item.image ? '' : 'ghost'}`}
            onClick={() => setPanel(panel?.id === item.id && panel.kind === 'image' ? null : { id: item.id, kind: 'image' })}
            title={item.image ? 'Change this item’s picture' : 'Add a picture to this item'}
            aria-label="Picture"
          >
            🖼️
          </button>
          <button
            type="button"
            className={`btn sm ${item.link ? '' : 'ghost'}`}
            onClick={() => setPanel(panel?.id === item.id && panel.kind === 'link' ? null : { id: item.id, kind: 'link' })}
            title={item.link ? 'Edit this item’s link' : 'Add a link (web address, or a filtered view of the File repository)'}
            aria-label="Link"
          >
            🔗
          </button>
          <button type="button" className="btn ghost sm" onClick={() => addParent(item.id)} title="Add a new item above this one that becomes its parent (this item moves under it)">
            + Parent
          </button>
          <button type="button" className="btn ghost sm" onClick={() => addSub(item.id)} title="Add a sub-item under this one">
            + Sub
          </button>
          <button type="button" className="btn ghost sm" onClick={() => indent(item.id)} title="Nest under the item above (Tab)">
            →
          </button>
          <button type="button" className="btn ghost sm" onClick={() => onChange(outdentItem(items, item.id))} title="Move out one level (Shift+Tab)" disabled={depth === 0}>
            ←
          </button>
          <button type="button" className="btn danger sm" onClick={() => onChange(removeItem(items, item.id))} title="Remove (and its sub-items)">
            ×
          </button>
        </div>
        {(item.image || item.link || (panel && panel.id === item.id)) && (
          <div className="checklist-edit-extras" style={{ paddingLeft: extraPad }}>
            {item.image && (
              <div className="checklist-edit-image">
                <ItemImage image={item.image} small />
                <span className="checklist-edit-image-name" title={item.image.name}>{item.image.name}</span>
                <button type="button" className="btn ghost sm" onClick={() => setPanel({ id: item.id, kind: 'image' })}>Replace</button>
                <button type="button" className="btn danger sm" onClick={() => onChange(patchItem(items, item.id, { image: null }))} title="Remove the picture from this item (it stays in the File repository)">×</button>
              </div>
            )}
            {item.link && !(panel?.id === item.id && panel.kind === 'link') && (
              <div className="checklist-edit-link">
                <ItemLink link={item.link} />
                {!linkTarget(item.link) && <span className="checklist-panel-error">This link isn’t usable — edit it.</span>}
                <button type="button" className="btn ghost sm" onClick={() => setPanel({ id: item.id, kind: 'link' })}>Edit</button>
                <button type="button" className="btn danger sm" onClick={() => onChange(patchItem(items, item.id, { link: null }))} title="Remove the link">×</button>
              </div>
            )}
            {renderPanel(item.id)}
          </div>
        )}
        </div>
        {kids.length > 0 && !isFolded && renderList(kids, depth + 1)}
      </div>
      );
    });
  }

  return (
    <div className={`checklist-edit${drag ? ' is-dragging' : ''}`} ref={rootRef}>
      <FoldBar
        hasParents={parents.length > 0}
        allCollapsed={parents.length > 0 && parents.every((id) => collapsed.has(id))}
        onCollapseAll={() => setFolded(parents)}
        onExpandAll={() => setFolded([])}
      />
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>No checklist items yet.</div>
      )}
      {renderList(items, 0)}
      <div className="checklist-add-row">
        <button type="button" className="btn ghost sm" onClick={addRoot}>
          + Add item
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy}
          onClick={() => setPanel(panel?.id === null && panel.kind === 'image' ? null : { id: null, kind: 'image' })}
          title="Add one or more pictures as checklist items"
        >
          🖼️ + Add picture
        </button>
        {busy && <span className="attach-status">Uploading…</span>}
      </div>
      {renderPanel(null)}
      {error && <div className="checklist-panel-error">{error}</div>}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { uploadImages(e.target.files, uploadTarget.current); e.target.value = ''; }}
      />
      {picking && createPortal(
        <FilePickerModal
          imagesOnly
          title="Pick pictures from the repository"
          actionLabel="Add"
          onPick={(files) => attachImages(files.map(imageOf), picking.id)}
          onClose={() => setPicking(null)}
        />,
        document.body
      )}
      {items.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 6 }}>
          Drag ⋮⋮ to re-order · Enter = new item · Tab or → (at end of text) = nest under the one above · Shift+Tab or ← (at start) = move out · + Parent = wrap in a new parent
        </div>
      )}
    </div>
  );
}

// Read-mostly nested checklist shown on a task in the list. Ticking a box
// calls onToggle(id) — or onToggle(id, 'check1' | 'check2') when `verify` is
// on and each item has two boxes; pass readOnly when the viewer can't edit. Every item
// that has sub-items gets a caret to fold it; when folded it shows how many
// of its hidden sub-items are done. `storageKey` (the task id) makes the
// folded state stick across reloads.
export function ChecklistView({ items, onToggle, readOnly, storageKey, verify = false, canVerify = false }) {
  const { collapsed, toggle, setAll } = useCollapsed(storageKey ? `checklist-folded:${storageKey}` : null);
  const parents = parentIds(items);

  function renderList(list, depth) {
    return list.map((item) => {
      const kids = item.children || [];
      const isFolded = kids.length > 0 && collapsed.has(item.id);
      const sub = isFolded ? countItems(kids) : null;
      return (
        <div key={item.id}>
          <div
            className={`checklist-view-row${verify ? ` verify-row ${verifyStatus(item)}` : ''}`}
            style={{ paddingLeft: depth * 20 }}
          >
            {kids.length > 0 ? (
              <button
                type="button"
                className="checklist-caret"
                onClick={() => toggle(item.id)}
                title={isFolded ? 'Show sub-items' : 'Hide sub-items'}
                aria-expanded={!isFolded}
              >
                {isFolded ? '▸' : '▾'}
              </button>
            ) : (
              <span className="checklist-caret spacer" />
            )}
            {verify ? (
              <div className="checklist-view-label verify">
                <VerifyBoxes
                  item={item}
                  disabled={readOnly && !canVerify}
                  lockFirst={readOnly}
                  onToggle={(key) => onToggle(item.id, key)}
                />
                <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ink3)' : 'var(--ink)' }}>
                  <Linkified text={item.text} />
                </span>
                {item.check2 && item.check2By?.name && (
                  <span className="verify-by" title={item.check2By.at ? new Date(item.check2By.at).toLocaleString() : ''}>
                    ✓ {item.check2By.name}
                  </span>
                )}
              </div>
            ) : (
              <label className="checklist-view-label">
                <input
                  type="checkbox"
                  checked={!!item.done}
                  disabled={readOnly}
                  onChange={() => onToggle(item.id)}
                />
                <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ink3)' : 'var(--ink)' }}>
                  <Linkified text={item.text} />
                </span>
              </label>
            )}
            {sub && (
              <span
                className={`checklist-sub-count ${sub.done === sub.total ? 'complete' : ''}`}
                title="Hidden sub-items (done/total)"
              >
                {sub.done}/{sub.total}
              </span>
            )}
          </div>
          <ItemExtras item={item} indent={depth * 20 + (verify ? 62 : 44)} />
          {kids.length > 0 && !isFolded && renderList(kids, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="checklist-view">
      <FoldBar
        hasParents={parents.length > 0}
        allCollapsed={parents.length > 0 && parents.every((id) => collapsed.has(id))}
        onCollapseAll={() => setAll(parents)}
        onExpandAll={() => setAll([])}
      />
      {renderList(items, 0)}
    </div>
  );
}
