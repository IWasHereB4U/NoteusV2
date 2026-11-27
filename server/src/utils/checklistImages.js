// Checklist items can carry a picture from the file repository:
//   { id, text, done, children, image: { fileId, name, url, ... } }
// Items nest to any depth, so Mongo can't update them in place — these walk
// the tree instead. Used when a repository file is renamed or deleted.

// Applies fn(item) to every item whose picture is `fileId`. fn returns the
// replacement item, or null to drop the item. Returns { items, changed } and
// never mutates its input.
export function rewriteImages(items, fileId, fn) {
  let changed = false;
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    let next = it;
    if (Array.isArray(it?.children) && it.children.length) {
      const kids = rewriteImages(it.children, fileId, fn);
      if (kids.changed) {
        next = { ...next, children: kids.items };
        changed = true;
      }
    }
    if (next?.image && String(next.image.fileId) === String(fileId)) {
      changed = true;
      next = fn(next);
      if (next == null) continue;
    }
    out.push(next);
  }
  return { items: out, changed };
}

// The picture is gone: remove it from the item. An item that was only a
// picture (no text, link or sub-items) goes away with it.
export function dropImage(item) {
  const { image, ...rest } = item; // eslint-disable-line no-unused-vars
  return rest.text || rest.link || (rest.children || []).length ? rest : null;
}

export const renameImage = (name) => (item) => ({ ...item, image: { ...item.image, name } });
