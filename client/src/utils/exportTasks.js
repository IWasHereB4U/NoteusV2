// Plain-text export of the task list, in the order and grouping shown on
// screen. Ticks are [x] / [ ] and nesting is 4 spaces per level, so the file
// reads fine in any editor and survives being pasted into email or chat.

const INDENT = '    ';

function checklistLines(items = [], depth = 1) {
  const lines = [];
  for (const it of items) {
    const text = (it.text || '').trim() || '(empty item)';
    lines.push(`${INDENT.repeat(depth)}[${it.done ? 'x' : ' '}] ${text}`);
    lines.push(...checklistLines(it.children || [], depth + 1));
  }
  return lines;
}

function taskLines(t, checklist) {
  const meta = [t.priority, t.due ? `due ${t.due}` : null].filter(Boolean).join(', ');
  const title = (t.title || '').trim() || '(untitled task)';
  const lines = [`[${t.done ? 'x' : ' '}] ${title}${meta ? `  (${meta})` : ''}`];
  const note = (t.note || '').trim();
  if (note) lines.push(...note.split(/\r?\n/).map((l) => `${INDENT}${l}`.trimEnd()));
  lines.push(...checklistLines(checklist));
  const macros = (t.macros || []).map((m) => (m.name || '').trim()).filter(Boolean);
  if (macros.length) lines.push(`${INDENT}Macros: ${macros.join(', ')}`);
  return lines;
}

// groups: [{ label, tasks }]; checklistOf(task) returns the checklist to use.
export function tasksToText(groups, checklistOf = (t) => t.checklist || [], { sortLabel } = {}) {
  const all = groups.flatMap((g) => g.tasks);
  const doneCount = all.filter((t) => t.done).length;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const out = ['TASKS', `Exported ${today} - ${all.length} task${all.length === 1 ? '' : 's'}, ${doneCount} done`];
  if (sortLabel) out.push(`Sorted by ${sortLabel}`);

  for (const g of groups) {
    if (!g.tasks.length) continue;
    out.push('', '', g.label.toUpperCase(), '-'.repeat(Math.max(g.label.length, 8)));
    g.tasks.forEach((t, i) => {
      if (i) out.push('');
      out.push(...taskLines(t, checklistOf(t)));
    });
  }
  return out.join('\n') + '\n';
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Safe, readable filename fragment from a task title.
export function slugify(text, fallback = 'task') {
  const slug = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || fallback;
}
