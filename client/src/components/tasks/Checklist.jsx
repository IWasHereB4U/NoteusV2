import { useEffect, useRef, useState } from 'react';
import {
  newItem, toggleItem, updateText, removeItem, addChild, insertAfter, indentItem, outdentItem,
  countItems, parentIds, ancestorIds,
} from './checklist.js';
import { useCollapsed } from '../../hooks/useCollapsed.js';

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

// Editable nested checklist, used inside the task and instance editors.
//
// Keyboard: Enter adds a sibling below, Tab (or → at the end of the text)
// nests the item under the one above it, Shift+Tab (or ← at the start)
// moves it back out, Backspace on an empty item
// removes it. The buttons do the same for anyone not using the keyboard.
export function ChecklistEditor({ items, onChange }) {
  const inputs = useRef({});
  const [focusId, setFocusId] = useState(null);
  // Folding in the editor is per-session only (no point remembering it).
  const { collapsed, toggle: toggleFold, setAll: setFolded, remove: unfold } = useCollapsed(null);
  const parents = parentIds(items);

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

  function indent(id) {
    const next = indentItem(items, id);
    onChange(next);
    reveal(next, id);
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
    } else if (e.key === 'Backspace' && !item.text && !(item.children || []).length) {
      e.preventDefault();
      onChange(removeItem(items, item.id));
    }
  }

  function renderList(list, depth) {
    return list.map((item) => {
      const kids = item.children || [];
      const isFolded = kids.length > 0 && collapsed.has(item.id);
      return (
      <div key={item.id}>
        <div className="checklist-edit-row" style={{ paddingLeft: depth * 22 }}>
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
          <input
            type="checkbox"
            checked={!!item.done}
            onChange={() => onChange(toggleItem(items, item.id))}
            title="Tick"
          />
          <input
            ref={(el) => (inputs.current[item.id] = el)}
            className="field sm"
            value={item.text}
            placeholder={depth ? 'Sub-item' : 'Checklist item'}
            onChange={(e) => onChange(updateText(items, item.id, e.target.value))}
            onKeyDown={(e) => onKeyDown(e, item)}
          />
          {isFolded && (
            <span className="checklist-sub-count" title="Hidden sub-items (done/total)">
              {(() => { const c = countItems(kids); return `${c.done}/${c.total}`; })()}
            </span>
          )}
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
        {kids.length > 0 && !isFolded && renderList(kids, depth + 1)}
      </div>
      );
    });
  }

  return (
    <div className="checklist-edit">
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
      <button type="button" className="btn ghost sm" onClick={addRoot} style={{ marginTop: 6 }}>
        + Add item
      </button>
      {items.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 6 }}>
          Enter = new item · Tab or → (at end of text) = nest under the one above · Shift+Tab or ← (at start) = move out
        </div>
      )}
    </div>
  );
}

// Read-mostly nested checklist shown on a task in the list. Ticking a box
// calls onToggle(id); pass readOnly when the viewer can't edit. Every item
// that has sub-items gets a caret to fold it; when folded it shows how many
// of its hidden sub-items are done. `storageKey` (the task id) makes the
// folded state stick across reloads.
export function ChecklistView({ items, onToggle, readOnly, storageKey }) {
  const { collapsed, toggle, setAll } = useCollapsed(storageKey ? `checklist-folded:${storageKey}` : null);
  const parents = parentIds(items);

  function renderList(list, depth) {
    return list.map((item) => {
      const kids = item.children || [];
      const isFolded = kids.length > 0 && collapsed.has(item.id);
      const sub = isFolded ? countItems(kids) : null;
      return (
        <div key={item.id}>
          <div className="checklist-view-row" style={{ paddingLeft: depth * 20 }}>
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
            <label className="checklist-view-label">
              <input
                type="checkbox"
                checked={!!item.done}
                disabled={readOnly}
                onChange={() => onToggle(item.id)}
              />
              <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ink3)' : 'var(--ink)' }}>
                {item.text}
              </span>
            </label>
            {sub && (
              <span
                className={`checklist-sub-count ${sub.done === sub.total ? 'complete' : ''}`}
                title="Hidden sub-items (done/total)"
              >
                {sub.done}/{sub.total}
              </span>
            )}
          </div>
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
