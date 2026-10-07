// MGOctaviano07Oct2026 — Project Timeline module (replaces Invoices).
//
// A project has up to two phases, one per status: "Coding Fix" and "UT".
// Each phase has three dates: start, deadline, finished.
//
//   Views    Year  — GitHub-contribution-style grid (weeks as columns)
//            Month — regular month calendar
//   Viewing  "All projects" — every project in its own color, so everything
//            is visible at once; overlapping phases share a cell as stripes.
//            Pick a single project — only that project is drawn.
//   Shades   Per project there are two shades of one color: the full color
//            is Coding Fix, a lighter tint of it is UT (e.g. orange / light
//            orange).
//   Dates    The three dates are drawn as markers on the calendar
//            (▶ start, ◎ deadline, ◆ finished), listed in the day panel
//            and shown on a per-phase track in the project list below.

import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal, ColorPickerField } from '../components/Modal.jsx';
import { KpiStrip } from '../components/KpiStrip.jsx';

const STATUSES = ['Coding Fix', 'UT'];
const STATUS_SHORT = { 'Coding Fix': 'CF', UT: 'UT' };
// First preset is orange on purpose — the default look is orange / light orange.
const PRESETS = ['#F08A24', '#0E9C92', '#5B6EE1', '#9B5DE5', '#F1614B', '#1F9D6B', '#E0559B', '#8A6D3B'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_SPAN_DAYS = 3660; // guards the day-by-day loops against a typo'd year
const MARKS = {
  start: { glyph: '▶', label: 'Start' },
  deadline: { glyph: '◎', label: 'Deadline' },
  finished: { glyph: '◆', label: 'Finished' },
};

// ---------- date helpers (all local, YYYY-MM-DD, DST-safe via UTC day numbers) ----------

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dayNum(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function isoOfNum(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtLong(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ---------- color helpers ----------

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : 'F08A24', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function tint(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
// Coding Fix = the project's color, UT = a lighter shade of the same color.
function shadeFor(color, status) {
  return status === 'UT' ? tint(color, 0.55) : color;
}
function textOn(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#0B1615' : '#FFFFFF';
}

// ---------- data shaping ----------

// One "entry" = one phase of one project — the unit that gets drawn.
// It spans from its start date to whichever is later of deadline/finished,
// so a phase that finished late still shows the overrun.
function buildEntries(projects) {
  const out = [];
  projects.forEach((p, pi) => {
    const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PRESETS[pi % PRESETS.length];
    (p.phases || []).forEach((ph) => {
      if (!ph.startDate) return;
      const end = [ph.deadlineDate, ph.finishedDate].filter(Boolean).reduce((a, b) => (a > b ? a : b), ph.startDate);
      const shade = shadeFor(color, ph.status);
      out.push({
        key: `${p._id}:${ph.status}`,
        projectId: p._id,
        name: p.name,
        status: ph.status,
        color,
        shade,
        ink: textOn(shade),
        start: ph.startDate,
        deadline: ph.deadlineDate || '',
        finished: ph.finishedDate || '',
        end,
        order: pi * 2 + (ph.status === 'UT' ? 1 : 0),
      });
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

// date -> { entries: [entry…], marks: [{type, entry}…] }
function buildDayMap(entries) {
  const map = new Map();
  const slot = (k) => {
    let v = map.get(k);
    if (!v) { v = { entries: [], marks: [] }; map.set(k, v); }
    return v;
  };
  for (const e of entries) {
    const a = dayNum(e.start);
    const b = Math.min(dayNum(e.end), a + MAX_SPAN_DAYS);
    for (let n = a; n <= b; n += 1) slot(isoOfNum(n)).entries.push(e);
    slot(e.start).marks.push({ type: 'start', entry: e });
    if (e.deadline) slot(e.deadline).marks.push({ type: 'deadline', entry: e });
    if (e.finished) slot(e.finished).marks.push({ type: 'finished', entry: e });
  }
  return map;
}

const isLateDay = (e, day) => !!(e.finished && e.deadline && day > e.deadline);
const isOverdue = (e, todayISO) => !e.finished && !!e.deadline && e.deadline < todayISO;

// Plain-English state of a phase, for the project list.
function phaseState(e, todayISO) {
  if (e.finished) {
    if (!e.deadline) return { text: 'Done', cls: 'ok' };
    const diff = dayNum(e.finished) - dayNum(e.deadline);
    if (diff < 0) return { text: `Done · ${-diff}d early`, cls: 'ok' };
    if (diff === 0) return { text: 'Done · on deadline', cls: 'ok' };
    return { text: `Done · ${diff}d late`, cls: 'late' };
  }
  if (e.deadline && e.deadline < todayISO) return { text: `Overdue · ${dayNum(todayISO) - dayNum(e.deadline)}d`, cls: 'bad' };
  if (e.start > todayISO) return { text: 'Upcoming', cls: 'idle' };
  if (e.deadline) return { text: `${dayNum(e.deadline) - dayNum(todayISO)}d left`, cls: 'run' };
  return { text: 'In progress', cls: 'run' };
}

function dayTitle(day, info) {
  if (!info) return fmtLong(day);
  const lines = [fmtLong(day)];
  info.entries.forEach((e) => lines.push(`${e.name} · ${e.status}`));
  info.marks.forEach((m) => lines.push(`${MARKS[m.type].glyph} ${MARKS[m.type].label}: ${m.entry.name} · ${m.entry.status}`));
  return lines.join('\n');
}

// ---------- small pieces ----------

// Marker shapes carry a white halo so they stay readable on any shade.
function Mark({ type, size = 10, overdue }) {
  const c = overdue ? '#C0392B' : '#0B1615';
  return (
    <svg className="pt-mk" width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      {type === 'start' && (
        <polygon points="1.2,0.8 9,5 1.2,9.2" fill={c} stroke="#fff" strokeWidth="1.2" paintOrder="stroke" strokeLinejoin="round" />
      )}
      {type === 'deadline' && (
        <>
          <circle cx="5" cy="5" r="3.3" fill="none" stroke="#fff" strokeWidth="3.6" />
          <circle cx="5" cy="5" r="3.3" fill="none" stroke={c} strokeWidth="1.8" />
        </>
      )}
      {type === 'finished' && (
        <polygon points="5,0.6 9.4,5 5,9.4 0.6,5" fill={c} stroke="#fff" strokeWidth="1.2" paintOrder="stroke" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function Legend({ projectEntriesById, projects, activeId, onPick }) {
  return (
    <div className="pt-legend">
      <div className="pt-legend-group">
        {projects.map((p, pi) => {
          const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PRESETS[pi % PRESETS.length];
          const on = activeId === p._id;
          return (
            <button
              key={p._id}
              type="button"
              className={`pt-lchip${on ? ' on' : ''}`}
              onClick={() => onPick(on ? 'all' : p._id)}
              title={on ? 'Click to show all projects again' : 'Click to view only this project'}
            >
              <span className="pt-sw" style={{ background: color }} />
              <span className="pt-sw" style={{ background: tint(color, 0.55) }} />
              {p.name}
              {!projectEntriesById.get(p._id) && <em> · no dates</em>}
            </button>
          );
        })}
      </div>
      <div className="pt-legend-group pt-legend-keys">
        <span><span className="pt-sw big" style={{ background: '#F08A24' }} /> Coding Fix = project color</span>
        <span><span className="pt-sw big" style={{ background: tint('#F08A24', 0.55) }} /> UT = lighter shade</span>
        <span><span className="pt-sw big pt-hatch" style={{ background: '#F08A24' }} /> Finished after deadline</span>
        {Object.entries(MARKS).map(([t, m]) => (
          <span key={t}><Mark type={t} /> {m.label}</span>
        ))}
        <span><Mark type="deadline" overdue /> Deadline passed, not finished</span>
      </div>
    </div>
  );
}

// ---------- year view: GitHub-style grid ----------

function YearGrid({ year, dayMap, todayISO, selected, onHover, onSelect }) {
  const jan1Num = dayNum(`${year}-01-01`);
  const dec31Num = dayNum(`${year}-12-31`);
  const offset = new Date(year, 0, 1).getDay();
  const startNum = jan1Num - offset;
  const cols = Math.ceil((dec31Num - startNum + 1) / 7);

  const monthLabels = MONTH_SHORT.map((label, m) => ({
    label,
    col: Math.floor((dayNum(`${year}-${String(m + 1).padStart(2, '0')}-01`) - startNum) / 7),
  }));

  const cells = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < 7; r += 1) {
      const n = startNum + c * 7 + r;
      if (n < jan1Num || n > dec31Num) continue;
      const day = isoOfNum(n);
      const info = dayMap.get(day);
      // Marker priority: finished > deadline > start; show at most two.
      const types = info ? ['finished', 'deadline', 'start'].filter((t) => info.marks.some((m) => m.type === t)).slice(0, 2) : [];
      const overdueDeadline = info?.marks.some((m) => m.type === 'deadline' && isOverdue(m.entry, todayISO));
      cells.push(
        <div
          key={day}
          className={`pt-cell${day === todayISO ? ' today' : ''}${selected === day ? ' sel' : ''}`}
          style={{ gridColumn: c + 2, gridRow: r + 2 }}
          title={dayTitle(day, info)}
          onMouseEnter={() => onHover(day)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(selected === day ? null : day)}
        >
          {info?.entries.slice(0, 4).map((e) => (
            <i key={e.key} className={`pt-stripe${isLateDay(e, day) ? ' late' : ''}`} style={{ background: e.shade }} />
          ))}
          {types.length > 0 && (
            <span className="pt-marks">
              {types.map((t) => <Mark key={t} type={t} size={7} overdue={t === 'deadline' && overdueDeadline} />)}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <div className="pt-yearwrap">
      <div className="pt-year" style={{ gridTemplateColumns: `30px repeat(${cols}, 14px)` }}>
        {monthLabels.map((m) => (
          <div key={m.label} className="pt-mlabel" style={{ gridColumn: `${m.col + 2} / span 3`, gridRow: 1 }}>{m.label}</div>
        ))}
        {[1, 3, 5].map((r) => (
          <div key={r} className="pt-dlabel" style={{ gridColumn: 1, gridRow: r + 2 }}>{DOW[r]}</div>
        ))}
        {cells}
      </div>
    </div>
  );
}

// ---------- month view ----------

function MonthGrid({ year, month, dayMap, todayISO, selected, onHover, onSelect }) {
  const offset = new Date(year, month, 1).getDay();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((offset + daysIn) / 7);
  const startNum = dayNum(`${year}-${String(month + 1).padStart(2, '0')}-01`) - offset;

  return (
    <div className="card pt-monthcard">
      <div className="pt-mhead">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="pt-month">
        {Array.from({ length: rows * 7 }, (_, i) => {
          const n = startNum + i;
          const day = isoOfNum(n);
          const inMonth = Number(day.slice(5, 7)) === month + 1;
          const info = dayMap.get(day);
          const shown = info?.entries.slice(0, 3) || [];
          const more = (info?.entries.length || 0) - shown.length;
          return (
            <div
              key={day}
              className={`pt-mday${inMonth ? '' : ' out'}${day === todayISO ? ' today' : ''}${selected === day ? ' sel' : ''}`}
              title={dayTitle(day, info)}
              onMouseEnter={() => onHover(day)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(selected === day ? null : day)}
            >
              <span className="pt-mnum">{Number(day.slice(8))}</span>
              {shown.map((e) => {
                const marks = info.marks.filter((m) => m.entry.key === e.key);
                return (
                  <div
                    key={e.key}
                    className={`pt-bar${isLateDay(e, day) ? ' late' : ''}`}
                    style={{ background: e.shade, color: e.ink }}
                  >
                    {marks.map((m) => <Mark key={m.type} type={m.type} size={10} overdue={m.type === 'deadline' && isOverdue(e, todayISO)} />)}
                    <span className="pt-bar-t">{e.name} · {STATUS_SHORT[e.status]}</span>
                  </div>
                );
              })}
              {more > 0 && <div className="pt-more">+{more} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- day panel ----------

function DayPanel({ day, info, todayISO }) {
  if (!day) {
    return <div className="pt-daypanel muted">Hover or tap a day to see which projects run on it and its start / deadline / finished dates.</div>;
  }
  return (
    <div className="pt-daypanel">
      <div className="pt-dp-h">{fmtLong(day)}{day === todayISO && <span className="pt-today-tag">Today</span>}</div>
      {!info || info.entries.length === 0 ? (
        <div className="muted">Nothing scheduled.</div>
      ) : (
        <div className="pt-dp-list">
          {info.entries.map((e) => {
            const marks = info.marks.filter((m) => m.entry.key === e.key);
            return (
              <div key={e.key} className="pt-dp-row">
                <span className="pt-sw big" style={{ background: e.shade }} />
                <b>{e.name}</b>
                <span className="pt-chip" style={{ background: e.shade, color: e.ink }}>{e.status}</span>
                {marks.map((m) => (
                  <span key={m.type} className="pt-dp-mark">
                    <Mark type={m.type} overdue={m.type === 'deadline' && isOverdue(e, todayISO)} /> {MARKS[m.type].label}
                  </span>
                ))}
                <span className="pt-dp-dates">
                  {fmtDate(e.start)} → {e.deadline ? fmtDate(e.deadline) : 'no deadline'}
                  {e.finished ? ` · finished ${fmtDate(e.finished)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- project list (shows all three dates per phase) ----------

function Track({ e, todayISO }) {
  const span = Math.max(1, dayNum(e.end) - dayNum(e.start));
  const pos = (d) => Math.min(1, Math.max(0, (dayNum(d) - dayNum(e.start)) / span));
  const left = (p) => `calc(6px + (100% - 12px) * ${p})`;
  const late = e.finished && e.deadline && e.finished > e.deadline;
  const showToday = !e.finished && todayISO >= e.start && todayISO <= e.end;
  return (
    <div className="pt-track">
      <div className="pt-track-bar" style={{ background: e.shade }}>
        {late && <div className="pt-track-late" style={{ left: `${pos(e.deadline) * 100}%` }} />}
      </div>
      {showToday && <div className="pt-track-today" style={{ left: left(pos(todayISO)) }} title="Today" />}
      <span className="pt-track-mk" style={{ left: left(0) }}><Mark type="start" /></span>
      {e.deadline && <span className="pt-track-mk" style={{ left: left(pos(e.deadline)) }}><Mark type="deadline" overdue={isOverdue(e, todayISO)} /></span>}
      {e.finished && <span className="pt-track-mk" style={{ left: left(pos(e.finished)) }}><Mark type="finished" /></span>}
    </div>
  );
}

function ProjectCard({ project, entries, todayISO, canEdit, onEdit, onDelete }) {
  return (
    <div className="pt-pcard">
      <div className="pt-pcard-h">
        <span className="pt-sw big" style={{ background: project.color }} />
        <span className="pt-sw big" style={{ background: tint(project.color, 0.55) }} />
        <div className="pt-pname">
          <b>{project.name}</b>
          {project.notes && <span>{project.notes}</span>}
        </div>
        {canEdit && (
          <div className="pt-pactions">
            <button className="btn ghost sm" onClick={() => onEdit(project)}>Edit</button>
            <button className="btn danger sm" onClick={() => onDelete(project)}>Delete</button>
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="pt-nodates">No dates yet{canEdit ? ' — use Edit to add Coding Fix / UT dates.' : '.'}</div>
      ) : (
        entries.map((e) => {
          const st = phaseState(e, todayISO);
          return (
            <div key={e.key} className="pt-phase">
              <div className="pt-phase-top">
                <span className="pt-chip" style={{ background: e.shade, color: e.ink }}>{e.status}</span>
                <span className={`pt-state ${st.cls}`}>{st.text}</span>
              </div>
              <Track e={e} todayISO={todayISO} />
              <div className="pt-dates">
                <span><Mark type="start" /> Start <b>{fmtDate(e.start)}</b></span>
                <span>
                  <Mark type="deadline" overdue={isOverdue(e, todayISO)} /> Deadline{' '}
                  {e.deadline ? <b>{fmtDate(e.deadline)}</b> : <em>not set</em>}
                </span>
                <span>
                  <Mark type="finished" /> Finished{' '}
                  {e.finished ? <b>{fmtDate(e.finished)}</b> : <em>not yet</em>}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------- add / edit modal ----------

const EMPTY_PHASE = { startDate: '', deadlineDate: '', finishedDate: '' };

function ProjectModal({ initial, defaultColor, onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || defaultColor);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [phases, setPhases] = useState(() => {
    const out = {};
    STATUSES.forEach((s) => {
      const ph = (initial?.phases || []).find((p) => p.status === s);
      out[s] = ph
        ? { startDate: ph.startDate || '', deadlineDate: ph.deadlineDate || '', finishedDate: ph.finishedDate || '' }
        : { ...EMPTY_PHASE };
    });
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setPhase = (status, key, val) => setPhases((p) => ({ ...p, [status]: { ...p[status], [key]: val } }));

  async function submit(ev) {
    ev.preventDefault();
    setError('');
    const out = [];
    for (const s of STATUSES) {
      const ph = phases[s];
      if (!ph.startDate && !ph.deadlineDate && !ph.finishedDate) continue; // phase left empty = not used
      if (!ph.startDate) return setError(`${s}: a start date is required.`);
      if (ph.deadlineDate && ph.deadlineDate < ph.startDate) return setError(`${s}: the deadline is before the start date.`);
      if (ph.finishedDate && ph.finishedDate < ph.startDate) return setError(`${s}: the finished date is before the start date.`);
      out.push({ status: s, startDate: ph.startDate, deadlineDate: ph.deadlineDate, finishedDate: ph.finishedDate });
    }
    setSaving(true);
    try {
      await onSubmit({ name, color, notes, phases: out });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial?._id ? 'Edit project' : 'New project'}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="pt-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="pt-form" onSubmit={submit}>
        <div className="field-row">
          <label>Project</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field-row">
          <label>Color <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>— Coding Fix uses this color, UT uses a lighter shade of it</span></label>
          <ColorPickerField value={color} onChange={setColor} presets={PRESETS} />
          <div className="pt-shadeprev">
            <span className="pt-chip" style={{ background: shadeFor(color, 'Coding Fix'), color: textOn(shadeFor(color, 'Coding Fix')) }}>Coding Fix</span>
            <span className="pt-chip" style={{ background: shadeFor(color, 'UT'), color: textOn(shadeFor(color, 'UT')) }}>UT</span>
          </div>
        </div>

        {STATUSES.map((s) => (
          <fieldset key={s} className="pt-fs">
            <legend>
              <span className="pt-sw big" style={{ background: shadeFor(color, s) }} /> {s}
            </legend>
            <div className="pt-fs-grid">
              <div className="field-row">
                <label>Start date</label>
                <input className="field" type="date" value={phases[s].startDate} onChange={(e) => setPhase(s, 'startDate', e.target.value)} />
              </div>
              <div className="field-row">
                <label>Deadline date</label>
                <input className="field" type="date" value={phases[s].deadlineDate} onChange={(e) => setPhase(s, 'deadlineDate', e.target.value)} />
              </div>
              <div className="field-row">
                <label>Finished date</label>
                <input className="field" type="date" value={phases[s].finishedDate} onChange={(e) => setPhase(s, 'finishedDate', e.target.value)} />
              </div>
            </div>
          </fieldset>
        ))}
        <div className="pt-hint">Leave a status's dates empty if the project doesn't have that phase.</div>

        <div className="field-row" style={{ marginTop: 12 }}>
          <label>Notes (optional)</label>
          <textarea className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

// ---------- page ----------

export function ProjectTimeline() {
  const { items: projects, reload, viewingId, error, loading } = useResource('/project-timelines');
  const { viewingSelf } = useAuth();

  const now = new Date();
  const todayISO = iso(now);
  const [scale, setScale] = useState('year'); // 'year' | 'month'
  const [focus, setFocus] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [pick, setPick] = useState('all'); // 'all' or a project _id
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  // A deleted project (or a switch of whose book is on screen) falls back to "all".
  const activeId = pick !== 'all' && projects.some((p) => p._id === pick) ? pick : 'all';
  const visibleProjects = useMemo(
    () => (activeId === 'all' ? projects : projects.filter((p) => p._id === activeId)),
    [projects, activeId]
  );
  // Entries for the whole book are built once so a project keeps the same
  // color no matter which view is active.
  const allEntries = useMemo(() => buildEntries(projects), [projects]);
  const entries = useMemo(
    () => (activeId === 'all' ? allEntries : allEntries.filter((e) => e.projectId === activeId)),
    [allEntries, activeId]
  );
  const dayMap = useMemo(() => buildDayMap(entries), [entries]);
  const entriesByProject = useMemo(() => {
    const m = new Map();
    allEntries.forEach((e) => m.set(e.projectId, [...(m.get(e.projectId) || []), e]));
    return m;
  }, [allEntries]);

  const panelDay = hover || selected;

  const kpis = [
    { label: 'Projects', value: visibleProjects.length, cls: 'info' },
    { label: 'In progress', value: entries.filter((e) => !e.finished && e.start <= todayISO && !isOverdue(e, todayISO)).length },
    { label: 'Overdue', value: entries.filter((e) => isOverdue(e, todayISO)).length, cls: 'out' },
    { label: 'Finished', value: entries.filter((e) => e.finished).length, cls: 'in' },
  ];

  function shift(dir) {
    if (scale === 'year') setFocus((f) => ({ ...f, y: f.y + dir }));
    else {
      const d = new Date(focus.y, focus.m + dir, 1);
      setFocus({ y: d.getFullYear(), m: d.getMonth() });
    }
  }
  function goToday() {
    setFocus({ y: now.getFullYear(), m: now.getMonth() });
  }

  async function save(values) {
    const payload = {
      name: values.name,
      color: values.color,
      notes: values.notes,
      phases: values.phases,
    };
    if (editing?._id) await api.put(`/project-timelines/${editing._id}`, payload, viewingId || undefined);
    else await api.post('/project-timelines', payload, viewingId || undefined);
    await reload();
  }

  async function remove(project) {
    if (!confirm(`Delete "${project.name}" and all of its dates?`)) return;
    await api.del(`/project-timelines/${project._id}`, viewingId || undefined);
    reload();
  }

  const defaultColor = PRESETS.find((c) => !projects.some((p) => (p.color || '').toLowerCase() === c.toLowerCase())) || PRESETS[projects.length % PRESETS.length];

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Planning</div><h1>Project Timeline</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setEditing({})}>+ New project</button>}
      </div>

      {error ? (
        <div className="card"><div className="empty"><b>Can't show Project Timeline</b>{error.message}</div></div>
      ) : (
        <>
          <KpiStrip items={kpis} />

          <div className="pt-toolbar">
            <button className="btn ghost sm" onClick={goToday}>Today</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn ghost sm" onClick={() => shift(-1)} aria-label="Previous">‹</button>
              <button className="btn ghost sm" onClick={() => shift(1)} aria-label="Next">›</button>
            </div>
            <div className="pt-title">
              {scale === 'year' ? focus.y : `${MONTH_NAMES[focus.m]} ${focus.y}`}
            </div>

            <div className="pt-toolbar-r">
              <label className="pt-viewsel">
                <span>View</span>
                <select className="field" value={activeId} onChange={(e) => setPick(e.target.value)}>
                  <option value="all">All projects</option>
                  {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={`btn sm ${scale === 'month' ? '' : 'ghost'}`} onClick={() => setScale('month')}>Month</button>
                <button className={`btn sm ${scale === 'year' ? '' : 'ghost'}`} onClick={() => setScale('year')}>Year</button>
              </div>
            </div>
          </div>

          {loading && projects.length === 0 ? (
            <div className="card"><div className="empty">Loading…</div></div>
          ) : projects.length === 0 ? (
            <div className="card">
              <div className="empty">
                <b>No projects yet</b>
                {viewingSelf ? 'Add a project with its Coding Fix and UT dates to see it on the timeline.' : 'Nothing has been added here yet.'}
              </div>
            </div>
          ) : (
            <>
              <Legend projectEntriesById={entriesByProject} projects={projects} activeId={activeId} onPick={setPick} />

              {scale === 'year' ? (
                <div className="card pt-yearcard">
                  <YearGrid
                    year={focus.y}
                    dayMap={dayMap}
                    todayISO={todayISO}
                    selected={selected}
                    onHover={setHover}
                    onSelect={setSelected}
                  />
                </div>
              ) : (
                <MonthGrid
                  year={focus.y}
                  month={focus.m}
                  dayMap={dayMap}
                  todayISO={todayISO}
                  selected={selected}
                  onHover={setHover}
                  onSelect={setSelected}
                />
              )}

              <DayPanel day={panelDay} info={panelDay ? dayMap.get(panelDay) : null} todayISO={todayISO} />

              <h2 className="section-title" style={{ margin: '26px 0 12px' }}>
                {activeId === 'all' ? 'All projects' : 'Project'} · dates
              </h2>
              <div className="pt-plist">
                {visibleProjects.map((p, i) => {
                  const idx = projects.indexOf(p);
                  const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PRESETS[(idx < 0 ? i : idx) % PRESETS.length];
                  return (
                    <ProjectCard
                      key={p._id}
                      project={{ ...p, color }}
                      entries={entriesByProject.get(p._id) || []}
                      todayISO={todayISO}
                      canEdit={viewingSelf}
                      onEdit={setEditing}
                      onDelete={remove}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <ProjectModal
          initial={editing}
          defaultColor={defaultColor}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
