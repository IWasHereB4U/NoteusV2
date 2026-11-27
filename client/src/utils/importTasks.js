// Reads back the plain-text file made by "Export .txt" (see exportTasks.js) —
// the whole list or a single task. The format it understands:
//
//   GROUP LABEL                      <- client name in capitals (or GENERAL (NO CLIENT))
//   ------------
//   [ ] Task title  (high, due 2026-11-30)
//       free-text note lines          <- indented, no box
//       [x] checklist item            <- 4 spaces per nesting level
//           [ ] sub-item
//       [x] item  {image: a.png} {link: https://…}   <- optional picture / link on an item
//       [x][ ] item                   <- two boxes = "needs verification" task
//       Macros: a, b                  <- names only; macro steps aren't in the file
//
// parseTasksText() turns the text into task objects, planImport() decides which
// are new and which overwrite an existing task of the same title.
import { newItemId, pruneEmpty, safeHref } from '../components/tasks/checklist.js';

const UNDERLINE = /^-{3,}$/;
const TASK_LINE = /^\[([ xX])\]\s(.*)$/;
const ITEM_LINE = /^\[([ xX])\](?:\[([ xX])\])?\s?(.*)$/;
const META = /^(.*?)\s{2}\((?:(low|normal|high)(?:, )?)?(?:due (\d{4}-\d{2}-\d{2}))?\)$/;
const GENERAL = 'GENERAL (NO CLIENT)';

const isX = (c) => String(c || '').toLowerCase() === 'x';

// {image: name} / {link: address} written after an item's text by the export.
const MARK = /\s*\{(image|link): ([^}]*)\}/g;
function splitMarks(raw) {
  const marks = {};
  const text = String(raw || '').replace(MARK, (_, k, v) => { marks[k] = v.trim(); return ''; }).trim();
  return { text, marks };
}

function linkFromMark(value) {
  if (!value) return null;
  const v = value;
  if (v.startsWith('/files')) {
    const p = new URLSearchParams(v.split('?')[1] || '');
    const link = { type: 'repo' };
    if (p.get('q')) link.q = p.get('q');
    if (p.get('kind')) link.kind = p.get('kind');
    if (p.get('file')) link.fileId = p.get('file');
    return link;
  }
  const href = safeHref(v);
  return href ? { type: 'url', href } : null;
}

// A picture can't travel in a .txt, only its file name. These put the real
// picture back by finding an item in the current tasks that uses that name;
// a name that matches nothing just drops the picture.
function imagePool(tasks) {
  const pool = new Map();
  const walk = (items) => items.forEach((it) => {
    if (it.image?.fileId && it.image.name && !pool.has(it.image.name)) pool.set(it.image.name, it.image);
    walk(it.children || []);
  });
  tasks.forEach((t) => walk(t.checklist || []));
  return pool;
}

function resolveImages(items, pool) {
  return items.map((it) => {
    const { image, ...rest } = it;
    const children = resolveImages(it.children || [], pool);
    const real = image && (image.fileId ? image : pool.get(image.name));
    return real ? { ...rest, image: { ...real }, children } : { ...rest, children };
  });
}

// A parent reads as done exactly when all of its children are (same rule the
// checklist uses when you tick boxes in the app).
function derive(items, verify) {
  return items.map((it) => {
    const children = derive(it.children || [], verify);
    if (!children.length) return { ...it, children };
    if (verify) {
      const check1 = children.every((c) => c.check1);
      const check2 = children.every((c) => c.check2);
      return { ...it, children, check1, check2, done: check1 && check2 };
    }
    return { ...it, children, done: children.every((c) => c.done) };
  });
}

export function parseTasksText(raw) {
  const lines = String(raw || '').replace(/^\uFEFF/, '').replace(/\t/g, '    ').split(/\r?\n/);
  const tasks = [];
  let group = null;
  let cur = null;
  let stack = [];
  let blanks = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) { blanks += 1; continue; }
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (indent === 0) {
      blanks = 0;
      if (UNDERLINE.test(body)) continue;
      const next = (lines[i + 1] || '').trim();
      const m = TASK_LINE.exec(body);
      if (!m && UNDERLINE.test(next)) { group = body; cur = null; continue; } // group header
      if (!m) { cur = null; continue; } // "TASKS", "Exported …", "Sorted by …"
      let title = m[2].trim();
      let priority = 'normal';
      let due = '';
      const mm = META.exec(title);
      if (mm) { title = mm[1].trim(); priority = mm[2] || 'normal'; due = mm[3] || ''; }
      if (title === '(untitled task)') title = '';
      cur = { groupLabel: group, title, done: isX(m[1]), priority, due, noteLines: [], checklist: [], verify: false, macroNames: [], inList: false };
      stack = [];
      tasks.push(cur);
      continue;
    }

    if (!cur) { blanks = 0; continue; }
    const bm = ITEM_LINE.exec(body);
    if (bm) {
      const verify = bm[2] !== undefined;
      if (verify) cur.verify = true;
      const { text: itemText, marks } = splitMarks(bm[3]);
      const item = {
        id: newItemId(),
        text: itemText === '(empty item)' ? '' : itemText,
        done: verify ? isX(bm[1]) && isX(bm[2]) : isX(bm[1]),
        check1: verify ? isX(bm[1]) : false,
        check2: verify ? isX(bm[2]) : false,
        children: [],
      };
      if (marks.image) item.image = { name: marks.image }; // resolved in planImport
      const link = linkFromMark(marks.link);
      if (link) item.link = link;
      const depth = Math.min(Math.max(0, Math.floor(indent / 4) - 1), stack.length);
      stack.length = depth;
      (depth === 0 ? cur.checklist : stack[depth - 1].children).push(item);
      stack.push(item);
      cur.inList = true;
    } else if (/^Macros:/i.test(body) && indent <= 4) {
      cur.macroNames = body.replace(/^Macros:/i, '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (!cur.inList) {
      if (cur.noteLines.length) for (let b = 0; b < blanks; b += 1) cur.noteLines.push('');
      cur.noteLines.push(line.slice(Math.min(4, indent)));
    }
    blanks = 0;
  }

  return tasks.map((t) => ({
    groupLabel: t.groupLabel,
    title: t.title,
    done: t.done,
    priority: t.priority,
    due: t.due,
    note: t.noteLines.join('\n').trimEnd(),
    needsVerification: t.verify,
    checklist: derive(pruneEmpty(t.checklist), t.verify),
    macroNames: t.macroNames,
  }));
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// existing: the current task list; clients: [{ _id, name }].
// Same title (ignoring case/extra spaces) = same task → overwritten. If the file
// repeats a title, the last copy wins. Link, macros and the instance a task came
// from are not in the export, so overwriting leaves them as they are.
export function planImport(parsed, existing, clients) {
  const byTitle = new Map();
  let skipped = 0;
  for (const t of parsed) {
    if (!norm(t.title)) { skipped += 1; continue; }
    byTitle.set(norm(t.title), t);
  }
  const clientByName = new Map(clients.map((c) => [norm(c.name), c._id]));
  const pool = imagePool(existing);
  const creates = [];
  const updates = [];
  const unmatchedClients = new Set();

  for (const t of byTitle.values()) {
    const match = existing.find((e) => norm(e.title) === norm(t.title));
    const payload = {
      title: t.title,
      done: t.done,
      priority: t.priority,
      due: t.due,
      note: t.note,
      checklist: pruneEmpty(resolveImages(t.checklist, pool)),
      needsVerification: t.needsVerification,
    };
    const label = (t.groupLabel || '').trim();
    if (!label || label.toUpperCase() === GENERAL) payload.clientId = null;
    else if (clientByName.has(norm(label))) payload.clientId = clientByName.get(norm(label));
    else {
      unmatchedClients.add(label);
      if (!match) payload.clientId = null; // overwrite keeps the task's current client
    }
    if (match) updates.push({ id: match._id, title: match.title, payload });
    else creates.push({ title: t.title, payload });
  }
  return { creates, updates, skipped, unmatchedClients: [...unmatchedClients] };
}
