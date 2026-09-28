import { useEffect, useRef, useState } from 'react';
import {
  newItem, toggleItem, updateText, removeItem, addChild, insertAfter, indentItem, outdentItem,
} from './checklist.js';

// Editable nested checklist, used inside the task and instance editors.
//
// Keyboard: Enter adds a sibling below, Tab nests the item under the one
// above it, Shift+Tab moves it back out, Backspace on an empty item
// removes it. The buttons do the same for anyone not using the keyboard.
export function ChecklistEditor({ items, onChange }) {
  const inputs = useRef({});
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    if (focusId && inputs.current[focusId]) {
      inputs.current[focusId].focus();
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
    onChange(addChild(items, parentId, it));
    setFocusId(it.id);
  }

  function onKeyDown(e, item) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const it = newItem();
      onChange(insertAfter(items, item.id, it));
      setFocusId(it.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onChange(e.shiftKey ? outdentItem(items, item.id) : indentItem(items, item.id));
      setFocusId(item.id);
    } else if (e.key === 'Backspace' && !item.text && !(item.children || []).length) {
      e.preventDefault();
      onChange(removeItem(items, item.id));
    }
  }

  function renderList(list, depth) {
    return list.map((item) => (
      <div key={item.id}>
        <div className="checklist-edit-row" style={{ paddingLeft: depth * 22 }}>
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
          <button type="button" className="btn ghost sm" onClick={() => addSub(item.id)} title="Add a sub-item under this one">
            + Sub
          </button>
          <button type="button" className="btn ghost sm" onClick={() => onChange(indentItem(items, item.id))} title="Nest under the item above (Tab)">
            →
          </button>
          <button type="button" className="btn ghost sm" onClick={() => onChange(outdentItem(items, item.id))} title="Move out one level (Shift+Tab)" disabled={depth === 0}>
            ←
          </button>
          <button type="button" className="btn danger sm" onClick={() => onChange(removeItem(items, item.id))} title="Remove (and its sub-items)">
            ×
          </button>
        </div>
        {(item.children || []).length > 0 && renderList(item.children, depth + 1)}
      </div>
    ));
  }

  return (
    <div className="checklist-edit">
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>No checklist items yet.</div>
      )}
      {renderList(items, 0)}
      <button type="button" className="btn ghost sm" onClick={addRoot} style={{ marginTop: 6 }}>
        + Add item
      </button>
      {items.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 6 }}>
          Enter = new item · Tab = nest under the one above · Shift+Tab = move out
        </div>
      )}
    </div>
  );
}

// Read-mostly nested checklist shown on a task in the list. Ticking a box
// calls onToggle(id); pass readOnly when the viewer can't edit.
export function ChecklistView({ items, onToggle, readOnly }) {
  function renderList(list, depth) {
    return list.map((item) => (
      <div key={item.id}>
        <label className="checklist-view-row" style={{ paddingLeft: depth * 20 }}>
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
        {(item.children || []).length > 0 && renderList(item.children, depth + 1)}
      </div>
    ));
  }
  return <div className="checklist-view">{renderList(items, 0)}</div>;
}
