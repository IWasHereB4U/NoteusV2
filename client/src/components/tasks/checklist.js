// Nested checklist helpers shared by Tasks and Task Instances.
//
// Shape: [{ id, text, done, children: [...] }] — children nest as deep as
// needed. Every helper is immutable (returns a new tree) so React state
// updates stay simple.

export function newItemId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newItem(text = '') {
  return { id: newItemId(), text, done: false, children: [] };
}

// Deep copy with fresh ids and every box unticked — what a task gets when
// it's created from an instance, so the two never share item ids or state.
export function cloneFresh(items = []) {
  return items.map((it) => ({
    id: newItemId(),
    text: it.text || '',
    done: false,
    children: cloneFresh(it.children || []),
  }));
}

export function countItems(items = []) {
  let total = 0;
  let done = 0;
  for (const it of items) {
    total += 1;
    if (it.done) done += 1;
    const sub = countItems(it.children || []);
    total += sub.total;
    done += sub.done;
  }
  return { total, done };
}

function setAll(items, done) {
  return items.map((it) => ({ ...it, done, children: setAll(it.children || [], done) }));
}

// Ticking an item ticks everything under it; unticking unticks everything
// under it. Afterwards each parent is re-derived from its children, so a
// parent reads as done exactly when all of its children are.
export function toggleItem(items, id) {
  const walk = (list) =>
    list.map((it) => {
      if (it.id === id) {
        const done = !it.done;
        return { ...it, done, children: setAll(it.children || [], done) };
      }
      const children = walk(it.children || []);
      const derived = children.length ? children.every((c) => c.done) : it.done;
      return { ...it, children, done: derived };
    });
  return walk(items);
}

export function updateText(items, id, text) {
  return items.map((it) =>
    it.id === id ? { ...it, text } : { ...it, children: updateText(it.children || [], id, text) }
  );
}

export function removeItem(items, id) {
  return items
    .filter((it) => it.id !== id)
    .map((it) => ({ ...it, children: removeItem(it.children || [], id) }));
}

export function addChild(items, parentId, item) {
  return items.map((it) =>
    it.id === parentId
      ? { ...it, children: [...(it.children || []), item] }
      : { ...it, children: addChild(it.children || [], parentId, item) }
  );
}

// Inserts `item` right after the sibling with id `afterId`, at whatever
// depth that sibling lives.
export function insertAfter(items, afterId, item) {
  const idx = items.findIndex((it) => it.id === afterId);
  if (idx !== -1) {
    const next = [...items];
    next.splice(idx + 1, 0, item);
    return next;
  }
  return items.map((it) => ({ ...it, children: insertAfter(it.children || [], afterId, item) }));
}

// Tab: the item becomes the last child of the sibling just above it.
// No sibling above → nothing to indent under, so the tree is unchanged.
export function indentItem(items, id) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx > 0) {
    const moving = items[idx];
    const prev = items[idx - 1];
    const next = items.filter((_, i) => i !== idx);
    next[idx - 1] = { ...prev, children: [...(prev.children || []), moving] };
    return next;
  }
  if (idx === 0) return items;
  return items.map((it) => ({ ...it, children: indentItem(it.children || [], id) }));
}

// Shift+Tab: the item moves out of its parent and sits right after it.
export function outdentItem(items, id) {
  for (let i = 0; i < items.length; i++) {
    const parent = items[i];
    const kids = parent.children || [];
    const k = kids.findIndex((c) => c.id === id);
    if (k !== -1) {
      const moving = kids[k];
      const next = [...items];
      next[i] = { ...parent, children: kids.filter((_, j) => j !== k) };
      next.splice(i + 1, 0, moving);
      return next;
    }
  }
  return items.map((it) => ({ ...it, children: outdentItem(it.children || [], id) }));
}

// Blank items are dropped on save so an accidental extra Enter doesn't
// leave empty checkboxes behind (a blank parent with filled-in children
// is kept, since removing it would lose them).
export function pruneEmpty(items = []) {
  return items
    .map((it) => ({ ...it, text: (it.text || '').trim(), children: pruneEmpty(it.children || []) }))
    .filter((it) => it.text || it.children.length);
}

// Adds https:// when someone types "example.com" so the link actually
// opens as an external page instead of a path inside the app.
export function normalizeLink(link) {
  const v = (link || '').trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v}`;
}
