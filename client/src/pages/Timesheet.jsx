import { useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

const COLORS = ['#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5'];
const PX_PER_HOUR = 26;
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_STATUSES = ['Draft', 'Pending', 'Approved', 'Revision'];
const STATUS_COLORS = {
  Draft: '#8A8F8E',
  Pending: '#DB9A2F',
  Approved: '#1F9D6B',
  Revision: '#C0392B',
};

const DAY_FIELDS = [
  { k: 'date', label: 'Date', type: 'date', required: true },
  { k: 'startTime', label: 'Start time', type: 'time', half: true },
  { k: 'endTime', label: 'Planned end (optional)', type: 'time', half: true },
  { k: 'status', label: 'Status', type: 'select', half: true, options: DAY_STATUSES.map((s) => [s, s]) },
];

const TASK_FIELDS = [
  { k: 'title', label: 'Task title', required: true },
  { k: 'detail', label: 'Task detail', type: 'textarea' },
  { k: 'hours', label: 'Hours done', type: 'number', half: true, required: true },
  { k: 'minutes', label: 'Minutes done', type: 'number', half: true, required: true },
  { k: 'billable', label: 'Billable', type: 'select', half: true, options: [['no', 'No'], ['yes', 'Yes']] },
];

// A timeskip is a fixed clock range (lunch, an appointment) rather than a
// duration — it doesn't get hours/minutes or billable, just a literal
// start/end that the schedule below routes tasks around.
const TIMESKIP_FIELDS = [
  { k: 'title', label: 'Label', required: true, placeholder: 'Lunch break' },
  { k: 'startTime', label: 'Start time', type: 'time', half: true, required: true },
  { k: 'endTime', label: 'End time', type: 'time', half: true, required: true },
];

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
  return diff > 0 ? diff : 0;
}

function minutesOfHHMM(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Local-date YYYY-MM-DD — matches the format WorkdayCard dates are stored
// in, without the UTC-shift risk of toISOString().
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Walks a clock time forward by a duration — used to chain each task off
// the point in the day the previous one finished.
function addMinutesToHHMM(hhmm, mins) {
  const base = minutesOfHHMM(hhmm);
  if (base == null) return null;
  const wrapped = ((base + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// "9:00 AM" — friendlier than the 24h HH:MM the <input type="time"> stores.
function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Chains each task's clock time off the day's start and the running total
// of work before it — same as before — but now routes around any
// timeskips (fixed clock ranges like a lunch break) that fall in between.
// A task whose duration straddles a timeskip comes back with multiple
// segments: e.g. a 2h task starting at 11 with a 12–1 lunch timeskip
// yields segments [11:00–12:00, 13:00–14:00] instead of one 11–13 block.
function scheduleTasks(day) {
  const timeskips = day.tasks
    .filter((t) => t.type === 'timeskip')
    .map((t) => ({ ...t, startMin: minutesOfHHMM(t.startTime), endMin: minutesOfHHMM(t.endTime) }))
    .filter((t) => t.startMin != null && t.endMin != null && t.endMin > t.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const dayStartMin = minutesOfHHMM(day.startTime);
  let cursor = dayStartMin ?? 0;
  let skipIdx = 0;
  const toClock = (min) => (dayStartMin == null ? null : addMinutesToHHMM('00:00', min));

  const scheduled = day.tasks
    .filter((t) => t.type !== 'timeskip')
    .map((t) => {
      let remaining = Number(t.hours || 0) * 60 + Number(t.minutes || 0);
      const segments = [];
      // Skip over any break we've already reached before this task starts.
      while (skipIdx < timeskips.length && timeskips[skipIdx].startMin <= cursor) {
        cursor = Math.max(cursor, timeskips[skipIdx].endMin);
        skipIdx++;
      }
      while (remaining > 0) {
        const nextSkipStart = skipIdx < timeskips.length ? timeskips[skipIdx].startMin : Infinity;
        const available = Math.max(nextSkipStart - cursor, 0);
        if (available === 0) {
          cursor = Math.max(cursor, timeskips[skipIdx].endMin);
          skipIdx++;
          continue;
        }
        const consumed = Math.min(remaining, available);
        segments.push({ start: cursor, end: cursor + consumed });
        cursor += consumed;
        remaining -= consumed;
      }
      return {
        ...t,
        segments: segments.map((s) => ({ clockStart: toClock(s.start), clockEnd: toClock(s.end) })),
        clockStart: segments.length ? toClock(segments[0].start) : null,
        clockEnd: segments.length ? toClock(segments[segments.length - 1].end) : null,
      };
    });

  return { scheduled, timeskips, endMin: cursor };
}

// Flattens scheduled tasks + timeskips into one chronological list of bar
// blocks — one per task *segment* (so a task split by a timeskip becomes
// two blocks, same color) plus one hatched block per timeskip — so the
// vertical fill bar mirrors the task list exactly instead of drawing each
// task as one uninterrupted slice.
function buildBarBlocks(scheduled, timeskips) {
  const blocks = [];
  scheduled.forEach((t, i) => {
    t.segments.forEach((seg, segIdx) => {
      const startMin = minutesOfHHMM(seg.clockStart);
      const endMin = minutesOfHHMM(seg.clockEnd);
      if (startMin == null || endMin == null) return;
      blocks.push({
        key: `${t._id || i}-${segIdx}`, startMin, durationMin: endMin - startMin,
        kind: 'task', billable: t.billable, colorIndex: i,
      });
    });
  });
  timeskips.forEach((s, i) => {
    blocks.push({ key: s._id || `skip-${i}`, startMin: s.startMin, durationMin: s.endMin - s.startMin, kind: 'timeskip' });
  });
  return blocks.sort((a, b) => a.startMin - b.startMin);
}

// "1h 30m" / "45m" / "2h" — never "1h 0m" or "0h 45m".
function formatHM(hours, minutes) {
  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const TABLE_HEADERS = ['Date', 'Task Start', 'Task End', 'Task Title', 'Task Detail', 'Hours', 'Minutes', 'Billable'];

// Moves task `fromId` to sit where task `toId` currently is, leaving any
// timeskips pinned at their existing positions in the array — only the
// task-type entries get permuted. This is the array order scheduleTasks
// reads from, so a drag reorder here is what changes each task's computed
// clock time (and therefore its position in the rendered timeline) once
// it's saved back to the day.
function reorderDayTasks(day, fromId, toId) {
  const taskIds = day.tasks.filter((t) => t.type !== 'timeskip').map((t) => t._id);
  const from = taskIds.indexOf(fromId);
  const to = taskIds.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return null;
  taskIds.splice(to, 0, taskIds.splice(from, 1)[0]);
  const byId = new Map(day.tasks.map((t) => [t._id, t]));
  let cursor = 0;
  return day.tasks.map((t) => (t.type === 'timeskip' ? t : byId.get(taskIds[cursor++])));
}

// One row per task segment (a task split by a timeskip becomes multiple
// rows), plus one row per timeskip so breaks show up in the export too —
// the export reflects the day's actual progression, not just its nominal
// start/end.
function buildTimesheetRows(sortedDays) {
  const rows = [];
  for (const day of sortedDays) {
    if (day.tasks.length === 0) {
      rows.push([day.date, day.startTime || '', day.endTime || '', '', '', '', '', '']);
      continue;
    }
    const { scheduled, timeskips } = scheduleTasks(day);
    for (const t of scheduled) {
      for (const seg of t.segments.length ? t.segments : [{ clockStart: null, clockEnd: null }]) {
        rows.push([
          day.date, seg.clockStart ? fmtClock(seg.clockStart) : '', seg.clockEnd ? fmtClock(seg.clockEnd) : '',
          t.title || '', t.detail || '', String(t.hours || 0), String(t.minutes || 0),
          t.billable ? 'Y' : 'N',
        ]);
      }
    }
    for (const s of timeskips) {
      rows.push([day.date, fmtClock(s.startTime), fmtClock(s.endTime), s.title || 'Timeskip', s.detail || '', '', '', '']);
    }
  }
  return rows;
}

// Writes both an HTML table and a tab-separated fallback to the clipboard
// in one go. Word and Excel both read the HTML flavor and paste a real
// table; anything that only understands plain text gets the TSV instead.
async function copyRowsToClipboard(headers, rows) {
  const tsv = [headers, ...rows].map((r) => r.join('\t')).join('\n');
  const html =
    `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(tsv);
  }
}

export function Timesheet() {
  const { items: days, reload, viewingId } = useResource('/timesheet-days');
  const { viewingSelf } = useAuth();
  const [editingDay, setEditingDay] = useState(null); // work-day form
  const [taskCtx, setTaskCtx] = useState(null); // { day, task } — task null = adding
  const [copyState, setCopyState] = useState('idle'); // 'idle' | 'copied' | 'error'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set()); // day._id's currently collapsed
  const [showCalendar, setShowCalendar] = useState(false);
  const dayRefs = useRef({});

  const sorted = useMemo(
    () => [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [days]
  );

  const markedDates = useMemo(() => new Set(days.map((d) => d.date).filter(Boolean)), [days]);

  function toggleCollapsed(id) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function collapseAll() {
    setCollapsedIds(new Set(sorted.map((d) => d._id)));
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  // Jumps to a date picked from the calendar. If a work day already exists
  // there, expand and scroll to it; otherwise offer to create one, since
  // there's nothing on the page to jump to yet.
  function jumpToDate(dateStr) {
    setShowCalendar(false);
    const match = days.find((d) => d.date === dateStr);
    if (match) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(match._id);
        return next;
      });
      requestAnimationFrame(() => {
        dayRefs.current[match._id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (viewingSelf) {
      setEditingDay({ date: dateStr, startTime: '09:00', endTime: '17:00', status: 'Draft' });
    }
  }

  async function saveDay(values) {
    const payload = { date: values.date, startTime: values.startTime, endTime: values.endTime, status: values.status || 'Draft' };
    if (editingDay?._id) await api.put(`/timesheet-days/${editingDay._id}`, payload, viewingId || undefined);
    else await api.post('/timesheet-days', { ...payload, tasks: [] }, viewingId || undefined);
    await reload();
  }

  async function removeDay(id) {
    if (!confirm('Delete this work day and all its logged tasks?')) return;
    await api.del(`/timesheet-days/${id}`, viewingId || undefined);
    reload();
  }

  async function setDayStatus(day, status) {
    if (status === (day.status || 'Draft')) return;
    await api.put(`/timesheet-days/${day._id}`, { status }, viewingId || undefined);
    reload();
  }

  async function saveTask(values) {
    const { day, task, type } = taskCtx;
    const isSkip = (task?.type ?? type) === 'timeskip';
    const payload = isSkip
      ? { type: 'timeskip', title: values.title, startTime: values.startTime, endTime: values.endTime, hours: 0, minutes: 0, billable: false }
      : {
          type: 'task',
          title: values.title,
          detail: values.detail,
          hours: Number(values.hours) || 0,
          minutes: Number(values.minutes) || 0,
          billable: values.billable === 'yes',
        };
    let tasks;
    if (task?._id) {
      tasks = day.tasks.map((t) => (t._id === task._id ? { ...t, ...payload } : t));
    } else {
      tasks = [...day.tasks, payload];
    }
    await api.put(`/timesheet-days/${day._id}`, { tasks }, viewingId || undefined);
    await reload();
  }

  async function removeTask(day, taskId) {
    if (!confirm('Delete this task?')) return;
    const tasks = day.tasks.filter((t) => t._id !== taskId);
    await api.put(`/timesheet-days/${day._id}`, { tasks }, viewingId || undefined);
    reload();
  }

  // Copies a task (or timeskip) with the same settings — title, detail,
  // hours/minutes, billable, or the fixed start/end for a timeskip — and
  // inserts the copy right after the original. It gets no _id, so the
  // server assigns a fresh subdocument id; the copy then gets rescheduled
  // like any other task once saved.
  async function duplicateTask(day, task) {
    const { _id, createdAt, updatedAt, __v, ...rest } = task;
    const idx = day.tasks.findIndex((t) => t._id === task._id);
    const tasks = [...day.tasks];
    tasks.splice(idx + 1, 0, rest);
    await api.put(`/timesheet-days/${day._id}`, { tasks }, viewingId || undefined);
    await reload();
  }

  async function reorderTasks(day, fromId, toId) {
    const tasks = reorderDayTasks(day, fromId, toId);
    if (!tasks) return;
    await api.put(`/timesheet-days/${day._id}`, { tasks }, viewingId || undefined);
    reload();
  }

  async function copyAll() {
    try {
      await copyRowsToClipboard(TABLE_HEADERS, buildTimesheetRows(sorted));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    } finally {
      setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  async function copyDay(day) {
    try {
      await copyRowsToClipboard(TABLE_HEADERS, buildTimesheetRows([day]));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    } finally {
      setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Time tracking</div><h1>Timesheet</h1></div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          {sorted.length > 0 && (
            <>
              <button className="btn ghost" onClick={collapseAll}>Collapse all</button>
              <button className="btn ghost" onClick={expandAll}>Expand all</button>
            </>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn ghost" onClick={() => setShowCalendar((s) => !s)}>📅 Jump to date</button>
            {showCalendar && (
              <MiniCalendar
                markedDates={markedDates}
                onSelect={jumpToDate}
                onClose={() => setShowCalendar(false)}
              />
            )}
          </div>
          {sorted.length > 0 && (
            <button className="btn ghost" onClick={copyAll}>
              {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy for Word/Excel'}
            </button>
          )}
          {viewingSelf && (
            <button className="btn" onClick={() => setEditingDay({ date: '', startTime: '09:00', endTime: '17:00', status: 'Draft' })}>
              + Add work day
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card"><div className="empty"><b>No work days logged yet</b>Add a work day, then log tasks against it.</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sorted.map((day) => (
            <div key={day._id} ref={(el) => (dayRefs.current[day._id] = el)}>
              <WorkdayCard
                day={day}
                viewingSelf={viewingSelf}
                collapsed={collapsedIds.has(day._id)}
                onToggleCollapsed={() => toggleCollapsed(day._id)}
                onEditDay={() => setEditingDay(day)}
                onDeleteDay={() => removeDay(day._id)}
                onSetStatus={(status) => setDayStatus(day, status)}
                onAddTask={() => setTaskCtx({ day, task: null, type: 'task' })}
                onAddTimeskip={() => setTaskCtx({ day, task: null, type: 'timeskip' })}
                onEditTask={(task) => setTaskCtx({ day, task, type: task.type })}
                onDeleteTask={(taskId) => removeTask(day, taskId)}
                onDuplicateTask={(task) => duplicateTask(day, task)}
                onReorderTasks={(fromId, toId) => reorderTasks(day, fromId, toId)}
                onCopyDay={() => copyDay(day)}
              />
            </div>
          ))}
        </div>
      )}

      {editingDay && (
        <FormModal
          title={editingDay._id ? 'Edit work day' : 'Add work day'}
          fields={DAY_FIELDS}
          initial={{ ...editingDay, status: editingDay.status || 'Draft' }}
          onSubmit={saveDay}
          onClose={() => setEditingDay(null)}
        />
      )}

      {taskCtx && (() => {
        const isSkip = (taskCtx.task?.type ?? taskCtx.type) === 'timeskip';
        return (
          <FormModal
            title={isSkip ? (taskCtx.task ? 'Edit timeskip' : 'Add timeskip') : (taskCtx.task ? 'Edit task' : 'Add task')}
            fields={isSkip ? TIMESKIP_FIELDS : TASK_FIELDS}
            initial={
              isSkip
                ? { ...taskCtx.task }
                : { hours: 0, minutes: 0, ...taskCtx.task, billable: taskCtx.task?.billable ? 'yes' : 'no' }
            }
            onSubmit={saveTask}
            onClose={() => setTaskCtx(null)}
          />
        );
      })()}
    </main>
  );
}

function WorkdayCard({ day, viewingSelf, collapsed, onToggleCollapsed, onEditDay, onDeleteDay, onSetStatus, onAddTask, onAddTimeskip, onEditTask, onDeleteTask, onDuplicateTask, onReorderTasks, onCopyDay }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const plannedHours = hoursBetween(day.startTime, day.endTime);
  const { scheduled, timeskips, endMin } = scheduleTasks(day);
  const totalMinutes = scheduled.reduce((s, t) => s + Number(t.hours || 0) * 60 + Number(t.minutes || 0), 0);
  const billableMinutes = scheduled.filter((t) => t.billable).reduce((s, t) => s + Number(t.hours || 0) * 60 + Number(t.minutes || 0), 0);
  const loggedDecimal = totalMinutes / 60;
  const over = plannedHours > 0 && loggedDecimal > plannedHours;
  // The day's actual end drifts with however much has been logged (and
  // skipped) so far, rather than staying pinned to whatever end time was
  // set when the day was created.
  const actualEnd = day.startTime ? addMinutesToHHMM('00:00', endMin) : null;
  const barBlocks = buildBarBlocks(scheduled, timeskips);
  // Chronological timeline: scheduled tasks (by their first segment) and
  // timeskips interleaved by clock time, so a lunch break shows up between
  // the task-halves it split rather than at the end of the list.
  const timeline = [
    ...scheduled.map((t) => ({ kind: 'task', item: t, sortMin: minutesOfHHMM(t.clockStart) ?? Infinity })),
    ...timeskips.map((s) => ({ kind: 'timeskip', item: s, sortMin: s.startMin })),
  ].sort((a, b) => a.sortMin - b.sortMin);
  const dateLabel = day.date
    ? new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date';

  return (
    <div className="card">
      <div className="card-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onToggleCollapsed}>
          <span
            style={{
              display: 'inline-block', transition: 'transform .15s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              fontSize: 11, color: 'var(--ink3)', userSelect: 'none',
            }}
          >
            ▾
          </span>
          <div>
            <h2>{dateLabel}</h2>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
              {day.startTime
                ? `${fmtClock(day.startTime)} – ${actualEnd ? fmtClock(actualEnd) : fmtClock(day.startTime)}${day.endTime ? ` · planned to ${fmtClock(day.endTime)}` : ''}`
                : 'No start time set'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`tag ${over ? 'rose' : 'green'}`}>{formatHM(Math.floor(totalMinutes / 60), totalMinutes % 60)} logged</span>
          {billableMinutes > 0 && <span className="tag ochre">{formatHM(Math.floor(billableMinutes / 60), billableMinutes % 60)} billable</span>}
          {viewingSelf ? (
            <select
              className="field sm"
              value={day.status || 'Draft'}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onSetStatus(e.target.value)}
              style={{
                color: STATUS_COLORS[day.status || 'Draft'], borderColor: STATUS_COLORS[day.status || 'Draft'],
                fontWeight: 600, fontSize: 11.5, width: 'auto',
              }}
            >
              {DAY_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className="tag" style={{ background: STATUS_COLORS[day.status || 'Draft'], color: '#fff', fontSize: 11 }}>
              {day.status || 'Draft'}
            </span>
          )}
          <button className="btn ghost sm" onClick={onCopyDay}>Copy</button>
          {viewingSelf && (
            <>
              <button className="btn ghost sm" onClick={onEditDay}>Edit</button>
              <button className="btn danger sm" onClick={onDeleteDay}>Delete</button>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
      <div style={{ display: 'flex', gap: 14, padding: '4px 2px 2px' }}>
        <WorkdayBar blocks={barBlocks} loggedHours={loggedDecimal} capacityHours={plannedHours} startTime={day.startTime} endLabel={actualEnd} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timeline.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No tasks logged for this day yet.</div>
          )}
          {timeline.map(({ kind, item: t }, i) =>
            kind === 'timeskip' ? (
              <div key={t._id || `skip-${i}`} className="row" style={{ gridTemplateColumns: '16px 10px 1fr auto auto', opacity: 0.75 }}>
                <span />
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(45deg, var(--ink3), var(--ink3) 2px, transparent 2px, transparent 4px)', display: 'inline-block' }} />
                <div style={{ fontStyle: 'italic' }}>{t.title || 'Timeskip'}</div>
                <span className="tag">{fmtClock(t.startTime)}–{fmtClock(t.endTime)} · Timeskip</span>
                {viewingSelf && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => onEditTask(t)}>Edit</button>
                    <button className="btn danger sm" onClick={() => onDeleteTask(t._id)}>Delete</button>
                  </div>
                )}
              </div>
            ) : (
              <div
                key={t._id || i}
                className="row"
                draggable={viewingSelf}
                onDragStart={(e) => { setDragId(t._id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (overId !== t._id) setOverId(t._id);
                }}
                onDragLeave={() => { if (overId === t._id) setOverId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== t._id) onReorderTasks(dragId, t._id);
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                style={{
                  gridTemplateColumns: '16px 10px 1fr auto auto',
                  opacity: dragId === t._id ? 0.4 : 1,
                  borderTop: '2px solid ' + (overId === t._id && dragId && dragId !== t._id ? 'var(--accent, #0E9C92)' : 'transparent'),
                }}
              >
                {viewingSelf ? (
                  <span
                    title="Drag to reorder"
                    style={{ cursor: 'grab', color: 'var(--ink3)', fontSize: 12, lineHeight: '10px', userSelect: 'none', textAlign: 'center' }}
                  >
                    ⠿
                  </span>
                ) : <span />}
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.billable ? COLORS[i % COLORS.length] : 'var(--ink3)', display: 'inline-block' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  {t.detail && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{t.detail}</div>}
                </div>
                <span className={`tag ${t.billable ? 'green' : 'ochre'}`}>
                  {t.segments.length
                    ? `${t.segments.map((s) => `${fmtClock(s.clockStart)}–${fmtClock(s.clockEnd)}`).join(', ')} · `
                    : ''}
                  {formatHM(t.hours, t.minutes)} · {t.billable ? 'Billable' : 'Non-billable'}
                </span>
                {viewingSelf && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => onEditTask(t)}>Edit</button>
                    <button className="btn ghost sm" onClick={() => onDuplicateTask(t)} title="Duplicate this task with the same settings">Duplicate</button>
                    <button className="btn danger sm" onClick={() => onDeleteTask(t._id)}>Delete</button>
                  </div>
                )}
              </div>
            )
          )}

          {viewingSelf && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn ghost sm" onClick={onAddTask}>+ Add task</button>
              <button className="btn ghost sm" onClick={onAddTimeskip}>+ Add timeskip</button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// Vertical "test-tube" bar: it starts empty and each block appended fills
// in the next slice — a task's own segments get its color, a timeskip gets
// a hatched pattern — so a lunch break shows as a visible gap that splits
// whatever task it interrupted, mirroring the task list below it. The bar's
// total height reflects the whole elapsed span (work + breaks), not just
// logged time, and the labels above/below track the day's actual start and
// its progression-based end.
function WorkdayBar({ blocks, loggedHours, capacityHours, startTime, endLabel }) {
  const spanHours = blocks.reduce((s, b) => s + b.durationMin, 0) / 60;
  const barHours = Math.max(capacityHours || 0, spanHours, 1);
  const barHeight = Math.round(barHours * PX_PER_HOUR);
  const capacityPx = capacityHours > 0 ? capacityHours * PX_PER_HOUR : null;

  let cursor = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {startTime && <span style={{ fontSize: 9, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{fmtClock(startTime)}</span>}
      <div
        title={`${formatHM(Math.floor(loggedHours), Math.round((loggedHours % 1) * 60))} logged${capacityHours ? ` of ${capacityHours}h planned` : ''}`}
        style={{
          position: 'relative', width: 16, height: barHeight, borderRadius: 8,
          background: 'var(--paper2, #f3efe8)', border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
      >
        {blocks.map((b) => {
          const h = Math.max(Math.round((b.durationMin / 60) * PX_PER_HOUR), 3);
          const top = cursor;
          cursor += h;
          if (b.kind === 'timeskip') {
            return (
              <div
                key={b.key}
                style={{
                  position: 'absolute', left: 0, right: 0, top, height: h - 1,
                  background: 'repeating-linear-gradient(45deg, var(--ink3), var(--ink3) 2px, transparent 2px, transparent 5px)',
                  opacity: 0.5,
                }}
              />
            );
          }
          const overflowing = capacityPx != null && top >= capacityPx;
          return (
            <div
              key={b.key}
              style={{
                position: 'absolute', left: 0, right: 0, top, height: h - 1,
                background: overflowing ? '#F1614B' : (b.billable ? COLORS[b.colorIndex % COLORS.length] : 'var(--ink3)'),
              }}
            />
          );
        })}
        {capacityPx != null && capacityPx < barHeight && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: capacityPx, height: 2, background: '#F1614B' }} />
        )}
      </div>
      {endLabel && <span style={{ fontSize: 9, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{fmtClock(endLabel)}</span>}
    </div>
  );
}
// Small dropdown month calendar for jumping straight to a date, rather than
// scrolling the flat day list. Days that already have a logged work day get
// a dot; picking one of those expands + scrolls to it, picking a bare date
// opens the "Add work day" form pre-filled with that date.
function MiniCalendar({ markedDates, onSelect, onClose }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const today = new Date();

  function shiftMonth(dir) {
    setCursor(new Date(year, month + dir, 1));
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 20 }}
        onClick={onClose}
      />
      <div
        className="card"
        style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 21,
          width: 260, padding: 10, boxShadow: '0 8px 24px rgba(11,22,21,.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button className="btn ghost sm" onClick={() => shiftMonth(-1)}>‹</button>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>
            {MONTH_NAMES[month]} {year}
          </div>
          <button className="btn ghost sm" onClick={() => shiftMonth(1)}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {DOW.map((d) => (
            <div key={d} style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', textAlign: 'center', padding: '2px 0' }}>
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const dateStr = iso(d);
            const inMonth = d.getMonth() === month;
            const isToday = iso(d) === iso(today);
            const hasEntry = markedDates.has(dateStr);
            return (
              <button
                key={dateStr}
                onClick={() => onSelect(dateStr)}
                title={hasEntry ? 'Go to logged day' : 'Add a work day here'}
                style={{
                  position: 'relative', border: 'none', background: isToday ? 'var(--teal-t)' : 'transparent',
                  borderRadius: 6, padding: '5px 0', cursor: 'pointer', opacity: inMonth ? 1 : 0.35,
                  color: isToday ? 'var(--teal)' : 'var(--ink2)', fontSize: 11.5, fontFamily: 'var(--mono)',
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {d.getDate()}
                {hasEntry && (
                  <span
                    style={{
                      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                      width: 4, height: 4, borderRadius: '50%', background: 'var(--teal, #0E9C92)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
