import { useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal, Modal } from '../components/Modal.jsx';
import { KpiStrip } from '../components/KpiStrip.jsx';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// --- Formatting -------------------------------------------------------------

function fcal(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' kcal';
}

// Signed, for net values: surplus reads "+250", deficit reads "−300".
function fnet(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return (v > 0 ? '+' : v < 0 ? '−' : '') + abs;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function ymd(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  return { y, m, d };
}

// Local-date YYYY-MM-DD. Deliberately not toISOString().slice(0,10) — that
// converts to UTC first and shows yesterday for part of every day anywhere
// ahead of UTC (e.g. the Philippines, UTC+8).
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "20 reps" / "30 min" — the stated amount of one round of a workout.
function measureText(w) {
  const a = Number(w.amount || 0);
  if (!a) return '';
  return w.measure === 'duration' ? `${a} min` : `${a} rep${a === 1 ? '' : 's'}`;
}

// Muscle groups a workout can be good for — kept in sync with BODY_PARTS in
// the Workout model on the server.
const BODY_PARTS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'full body'];
const partLabel = (p) => p.charAt(0).toUpperCase() + p.slice(1);

const partsOf = (w) => w.bodyParts || []; // older workouts have none saved

// Every body part any workout in the set is good for (de-duplicated, in the
// standard order) — derived live, so editing a workout updates its sets.
function setParts(set, workoutsById) {
  const found = new Set();
  (set.items || []).forEach((it) => {
    const w = workoutsById.get(String(it.workoutId));
    if (w) partsOf(w).forEach((p) => found.add(p));
  });
  return BODY_PARTS.filter((p) => found.has(p));
}

function PartTags({ parts }) {
  if (!parts.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {parts.map((p) => <span key={p} className="tag green">{partLabel(p)}</span>)}
    </span>
  );
}

// Total calories burned by a set: every listed workout's calories × how many
// rounds of it the set calls for. Always derived from the workouts' current
// numbers, so editing a workout updates every set that uses it.
function setTotal(set, workoutsById) {
  return round2(
    (set.items || []).reduce((sum, it) => {
      const w = workoutsById.get(String(it.workoutId));
      return sum + (w ? Number(w.calories || 0) * Number(it.times || 1) : 0);
    }, 0)
  );
}

// --- Filtering --------------------------------------------------------------
// Same three ways to narrow the log as Money, in priority order: a calendar
// selection beats a manual date range, which beats the quick buttons. Only
// one is ever active — picking one clears the others.

function inPeriod(e, period) {
  if (period === 'all') return true;
  const now = new Date();
  const { y, m, d } = ymd(e.date);
  if (period === 'today') return y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
  if (period === 'month') return y === now.getFullYear() && m === now.getMonth() + 1;
  if (period === 'year') return y === now.getFullYear();
  return true;
}

function inRange(e, start, end) {
  if (start && e.date < start) return false;
  if (end && e.date > end) return false;
  return true;
}

function inSelection(e, sel) {
  const { y, m, d } = ymd(e.date);
  if (sel.granularity === 'day') return y === sel.year && m === sel.month && sel.keys.has(d);
  if (sel.granularity === 'month') return y === sel.year && sel.keys.has(m);
  return sel.keys.has(y);
}

// One bucket per day of the navigated month, per month of the navigated
// year, or per year seen in the data. The calendar grid and the graph both
// read this same shape so they never disagree.
function buildBuckets(items, granularity, cursor) {
  const grouped = new Map();
  const bump = (key, e) => {
    const cur = grouped.get(key) || { intake: 0, burn: 0 };
    if (e.type === 'burn') cur.burn += Number(e.calories || 0);
    else cur.intake += Number(e.calories || 0);
    grouped.set(key, cur);
  };
  const make = (key, label) => {
    const v = grouped.get(key) || { intake: 0, burn: 0 };
    return { key, label, intake: v.intake, burn: v.burn, net: v.intake - v.burn };
  };

  if (granularity === 'day') {
    items.forEach((e) => {
      const { y, m, d } = ymd(e.date);
      if (y === cursor.year && m === cursor.month) bump(d, e);
    });
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const leadingBlanks = new Date(cursor.year, cursor.month - 1, 1).getDay();
    const buckets = [];
    for (let d = 1; d <= daysInMonth; d++) buckets.push(make(d, String(d)));
    return { buckets, leadingBlanks, title: `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}` };
  }

  if (granularity === 'month') {
    items.forEach((e) => {
      const { y, m } = ymd(e.date);
      if (y === cursor.year) bump(m, e);
    });
    const buckets = [];
    for (let m = 1; m <= 12; m++) buckets.push(make(m, MONTH_NAMES[m - 1]));
    return { buckets, leadingBlanks: 0, title: String(cursor.year) };
  }

  items.forEach((e) => bump(ymd(e.date).y, e));
  const years = [...new Set([...grouped.keys(), cursor.year])].sort((a, b) => a - b);
  return { buckets: years.map((y) => make(y, String(y))), leadingBlanks: 0, title: 'All years' };
}

const ENTRY_FIELDS = [
  { k: 'type', label: 'Type', type: 'select', options: [['intake', 'Calories eaten'], ['burn', 'Calories burned']], half: true },
  { k: 'date', label: 'Date', type: 'date', half: true, required: true },
  { k: 'name', label: 'Name', placeholder: 'e.g. Lunch, Evening run' },
  { k: 'calories', label: 'Calories (kcal)', type: 'number', half: true, required: true },
  { k: 'note', label: 'Note', type: 'textarea' },
];

const FOOD_FIELDS = [
  { k: 'name', label: 'Food name', required: true, placeholder: 'e.g. Fried egg' },
  { k: 'calories', label: 'Calories (kcal)', type: 'number', required: true },
];

const LIB_TABS = [['foods', 'Foods'], ['workouts', 'Workouts'], ['sets', 'Sets']];

export function Calorie() {
  const entriesRes = useResource('/calorie-entries');
  const foodsRes = useResource('/foods');
  const workoutsRes = useResource('/workouts');
  const setsRes = useResource('/workout-sets');
  const { viewingId, viewingSelf } = useAuth();
  const as = viewingId || undefined;

  const items = entriesRes.items;
  const foods = foodsRes.items;
  const workouts = workoutsRes.items;
  const sets = setsRes.items;
  const workoutsById = useMemo(() => new Map(workouts.map((w) => [String(w._id), w])), [workouts]);

  const [editing, setEditing] = useState(null); // null closed | {} new | entry edit
  const [foodModal, setFoodModal] = useState(null);
  const [workoutModal, setWorkoutModal] = useState(null);
  const [setModal, setSetModal] = useState(null);
  const [error, setError] = useState('');

  // Quick add: which library is showing, which day it logs to, and how
  // many servings / rounds each row will add.
  const [libTab, setLibTab] = useState('foods');
  const [logDate, setLogDate] = useState(localISODate());
  const [qty, setQty] = useState({});
  const [flash, setFlash] = useState('');
  const [libSearch, setLibSearch] = useState('');
  const [libParts, setLibParts] = useState([]); // body-part filter for workouts + sets (matches any)

  const [period, setPeriod] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [calendarSelection, setCalendarSelection] = useState(null);
  const lastClickedKeyRef = useRef(null);

  const [granularity, setGranularity] = useState('day');
  const [explorerView, setExplorerView] = useState('calendar');
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const isFiltered = period !== 'all' || !!dateRange.start || !!dateRange.end || (calendarSelection && calendarSelection.keys.size > 0);

  const filtered = useMemo(() => {
    let list = items;
    if (calendarSelection && calendarSelection.keys.size > 0) list = list.filter((e) => inSelection(e, calendarSelection));
    else if (dateRange.start || dateRange.end) list = list.filter((e) => inRange(e, dateRange.start, dateRange.end));
    else list = list.filter((e) => inPeriod(e, period));
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
  }, [items, calendarSelection, dateRange, period]);

  const filterLabel = useMemo(() => {
    if (calendarSelection && calendarSelection.keys.size > 0) {
      const n = calendarSelection.keys.size;
      const unit = calendarSelection.granularity === 'day' ? 'day' : calendarSelection.granularity === 'month' ? 'month' : 'year';
      return `${n} ${unit}${n === 1 ? '' : 's'} selected`;
    }
    if (dateRange.start || dateRange.end) return `${dateRange.start || '…'} to ${dateRange.end || '…'}`;
    return null;
  }, [calendarSelection, dateRange]);

  // Net = eaten − burned. A positive net is a surplus, negative a deficit.
  // Everything is derived from `filtered`, so the KPI strip moves with
  // whichever filter is active.
  const totals = useMemo(() => {
    const sum = (type) => filtered.filter((e) => e.type === type).reduce((s, e) => s + Number(e.calories || 0), 0);
    const intake = sum('intake');
    const burn = sum('burn');
    const days = new Set(filtered.map((e) => e.date)).size;
    return { intake, burn, net: intake - burn, avg: days ? (intake - burn) / days : 0, days };
  }, [filtered]);

  const { buckets, leadingBlanks, title } = useMemo(() => buildBuckets(items, granularity, cursor), [items, granularity, cursor]);

  const selectedKeysForDisplay = useMemo(() => {
    if (!calendarSelection) return new Set();
    const matches = calendarSelection.granularity === granularity && calendarSelection.year === cursor.year
      && (granularity !== 'day' || calendarSelection.month === cursor.month);
    return matches ? calendarSelection.keys : new Set();
  }, [calendarSelection, granularity, cursor]);

  function shiftCursor(dir) {
    setCursor((c) => {
      if (granularity === 'day') {
        const m = c.month + dir;
        if (m < 1) return { year: c.year - 1, month: 12 };
        if (m > 12) return { year: c.year + 1, month: 1 };
        return { ...c, month: m };
      }
      if (granularity === 'month') return { ...c, year: c.year + dir };
      return c;
    });
  }

  function applyPeriod(val) {
    setPeriod(val);
    setDateRange({ start: '', end: '' });
    setCalendarSelection(null);
  }

  function applyRange(patch) {
    setDateRange((r) => ({ ...r, ...patch }));
    setCalendarSelection(null);
  }

  function removeFilter() {
    setPeriod('all');
    setDateRange({ start: '', end: '' });
    setCalendarSelection(null);
  }

  // Click toggles one bucket in/out of the selection; shift-click extends
  // from the last-clicked bucket (same convention as Money).
  function handleCellClick(bucket, shiftKey) {
    setDateRange({ start: '', end: '' });
    setCalendarSelection((prev) => {
      const sameScope = prev && prev.granularity === granularity && prev.year === cursor.year
        && (granularity !== 'day' || prev.month === cursor.month);
      let keys = sameScope ? new Set(prev.keys) : new Set();
      if (shiftKey && sameScope && lastClickedKeyRef.current != null) {
        const all = buckets.map((b) => b.key);
        const i1 = all.indexOf(lastClickedKeyRef.current);
        const i2 = all.indexOf(bucket.key);
        if (i1 !== -1 && i2 !== -1) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          keys = new Set(all.slice(lo, hi + 1));
        }
      } else if (keys.has(bucket.key)) {
        keys.delete(bucket.key);
      } else {
        keys.add(bucket.key);
      }
      lastClickedKeyRef.current = bucket.key;
      return keys.size > 0 ? { granularity, year: cursor.year, month: cursor.month, keys } : null;
    });
  }

  // --- Log entries ---

  async function saveEntry(values) {
    const body = {
      type: values.type,
      date: values.date,
      name: String(values.name || '').trim(),
      calories: Math.max(0, Number(values.calories) || 0),
      note: values.note,
    };
    if (editing?._id) await api.put(`/calorie-entries/${editing._id}`, body, as);
    else await api.post('/calorie-entries', { ...body, source: 'manual' }, as);
    await entriesRes.reload();
  }

  async function removeEntry(id) {
    if (!confirm('Delete this entry?')) return;
    await api.del(`/calorie-entries/${id}`, as);
    entriesRes.reload();
  }

  // --- Quick add from a library ---
  // The entry is a snapshot (name + calories copied in), so later edits to
  // a food/workout/set never rewrite days that were already logged.

  const getQty = (id) => Math.max(1, Number(qty[id]) || 1);

  async function quickAdd(entry) {
    setError('');
    setFlash('');
    if (!logDate) { setError('Pick a date to log to.'); return; }
    try {
      await api.post('/calorie-entries', { ...entry, date: logDate, calories: round2(entry.calories) }, as);
      await entriesRes.reload();
      setFlash(`Added “${entry.name}” (${entry.type === 'burn' ? '−' : '+'}${fcal(entry.calories)}) to ${logDate}`);
    } catch (err) {
      setError(err.message || 'Could not add that entry');
    }
  }

  function addFood(f) {
    const n = getQty(f._id);
    return quickAdd({
      type: 'intake', source: 'food', name: f.name,
      calories: Number(f.calories || 0) * n,
      note: n > 1 ? `${n} servings` : '',
    });
  }

  function addWorkout(w) {
    const n = getQty(w._id);
    const per = measureText(w);
    return quickAdd({
      type: 'burn', source: 'workout', name: w.name,
      calories: Number(w.calories || 0) * n,
      note: [n > 1 ? `${n} × ${per || 'rounds'}` : per].filter(Boolean).join(''),
    });
  }

  function addSet(s) {
    const n = getQty(s._id);
    const parts = (s.items || [])
      .map((it) => {
        const w = workoutsById.get(String(it.workoutId));
        return w ? `${w.name}${Number(it.times) > 1 ? ` ×${it.times}` : ''}` : null;
      })
      .filter(Boolean);
    return quickAdd({
      type: 'burn', source: 'set', name: s.name,
      calories: setTotal(s, workoutsById) * n,
      note: (n > 1 ? `${n} rounds · ` : '') + parts.join(', '),
    });
  }

  // --- Libraries: save / delete ---

  async function saveFood(values) {
    const body = { name: values.name.trim(), calories: Math.max(0, Number(values.calories) || 0) };
    if (foodModal?._id) await api.put(`/foods/${foodModal._id}`, body, as);
    else await api.post('/foods', body, as);
    await foodsRes.reload();
  }

  async function removeFood(id) {
    if (!confirm('Delete this food? Entries already logged are kept.')) return;
    await api.del(`/foods/${id}`, as);
    foodsRes.reload();
  }

  async function saveWorkout(body) {
    if (workoutModal?._id) await api.put(`/workouts/${workoutModal._id}`, body, as);
    else await api.post('/workouts', body, as);
    await workoutsRes.reload();
  }

  async function removeWorkout(id) {
    if (!confirm('Delete this workout? It will also be removed from any set that uses it. Entries already logged are kept.')) return;
    await api.del(`/workouts/${id}`, as);
    await workoutsRes.reload();
    setsRes.reload(); // the server stripped it from sets
  }

  async function saveSet(body) {
    if (setModal?._id) await api.put(`/workout-sets/${setModal._id}`, body, as);
    else await api.post('/workout-sets', body, as);
    await setsRes.reload();
  }

  async function removeSet(id) {
    if (!confirm('Delete this set? Entries already logged are kept.')) return;
    await api.del(`/workout-sets/${id}`, as);
    setsRes.reload();
  }

  const qtyInput = (id) => (
    <input
      className="field"
      type="number"
      min="1"
      step="1"
      title="Servings / rounds"
      value={qty[id] ?? 1}
      onChange={(e) => setQty((q) => ({ ...q, [id]: e.target.value }))}
      style={{ width: 58, padding: '6px 8px' }}
    />
  );

  const actions = (onEdit, onDelete) => (
    <>
      <button className="btn ghost sm" onClick={onEdit}>Edit</button>
      <button className="btn danger sm" onClick={onDelete}>Delete</button>
    </>
  );

  // Search + body-part filter for the Quick add lists. Search matches names
  // (a set also matches the names of the workouts inside it) and body parts;
  // the chips keep anything good for at least one selected part.
  const q = libSearch.trim().toLowerCase();
  const hasPartFilter = libParts.length > 0;
  const foodsView = foods.filter((f) => !q || f.name.toLowerCase().includes(q));
  const workoutsView = workouts.filter((w) => {
    const parts = partsOf(w);
    if (hasPartFilter && !parts.some((p) => libParts.includes(p))) return false;
    return !q || w.name.toLowerCase().includes(q) || parts.some((p) => p.includes(q));
  });
  const setsView = sets.filter((s) => {
    const parts = setParts(s, workoutsById);
    if (hasPartFilter && !parts.some((p) => libParts.includes(p))) return false;
    if (!q) return true;
    const names = (s.items || []).map((it) => workoutsById.get(String(it.workoutId))?.name || '');
    return s.name.toLowerCase().includes(q) || names.some((n) => n.toLowerCase().includes(q)) || parts.some((p) => p.includes(q));
  });
  const noMatch = <div className="empty"><b>No matches</b>Try a different search or clear the body-part filter.</div>;

  const libTitle = { foods: 'food', workouts: 'workout', sets: 'set' }[libTab];
  const openNewLib = () => {
    if (libTab === 'foods') setFoodModal({});
    else if (libTab === 'workouts') setWorkoutModal({});
    else setSetModal({});
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Tracker</div>
          <h1>Calorie</h1>
        </div>
        {viewingSelf && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => setEditing({ type: 'intake', date: localISODate(today) })}>Add calories</button>
            <button className="btn ghost" onClick={() => setEditing({ type: 'burn', date: localISODate(today) })}>Burn calories</button>
          </div>
        )}
      </div>

      <KpiStrip
        items={[
          { label: 'Eaten', value: fcal(totals.intake), cls: 'due' },
          { label: 'Burned', value: fcal(totals.burn), cls: 'in' },
          { label: 'Net', value: `${fnet(totals.net)} kcal`, cls: 'info' },
          { label: `Avg net / logged day${totals.days ? ` (${totals.days})` : ''}`, value: `${fnet(totals.avg)} kcal` },
        ]}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['today', 'Today'], ['month', 'This month'], ['year', 'This year'], ['all', 'All']].map(([val, label]) => (
          <button
            key={val}
            className={`btn ${!dateRange.start && !dateRange.end && !calendarSelection && period === val ? '' : 'ghost'} sm`}
            onClick={() => applyPeriod(val)}
          >
            {label}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <input className="field" type="date" style={{ width: 148 }} value={dateRange.start} onChange={(e) => applyRange({ start: e.target.value })} />
        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>to</span>
        <input className="field" type="date" style={{ width: 148 }} value={dateRange.end} onChange={(e) => applyRange({ end: e.target.value })} />
        {filterLabel && <span className="tag ochre">{filterLabel}</span>}
        {isFiltered && <button className="btn ghost sm" onClick={removeFilter}>Remove filter</button>}
      </div>

      <CalorieExplorer
        buckets={buckets}
        leadingBlanks={leadingBlanks}
        title={title}
        granularity={granularity}
        setGranularity={setGranularity}
        view={explorerView}
        setView={setExplorerView}
        onPrev={() => shiftCursor(-1)}
        onNext={() => shiftCursor(1)}
        onToday={() => setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 })}
        onCellClick={handleCellClick}
        selectedKeys={selectedKeysForDisplay}
      />

      {viewingSelf && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h2>Quick add</h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {LIB_TABS.map(([val, label]) => (
                <button key={val} className={`btn ${libTab === val ? '' : 'ghost'} sm`} onClick={() => { setLibTab(val); setLibSearch(''); }}>{label}</button>
              ))}
              <span style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 2px' }} />
              <button className="btn ghost sm" onClick={openNewLib}>+ New {libTitle}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--ink3)' }}>Log to</label>
            <input className="field" type="date" style={{ width: 148 }} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              The number box is servings (foods) or rounds (workouts, sets).
            </span>
          </div>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="field"
                type="search"
                placeholder={libTab === 'foods' ? 'Search foods…' : libTab === 'workouts' ? 'Search workouts or body parts…' : 'Search sets, their workouts or body parts…'}
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              {(libSearch || (libTab !== 'foods' && hasPartFilter)) && (
                <button className="btn ghost sm" onClick={() => { setLibSearch(''); setLibParts([]); }}>Clear</button>
              )}
            </div>
            {libTab !== 'foods' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Good for</span>
                {BODY_PARTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn ${libParts.includes(p) ? '' : 'ghost'} sm`}
                    onClick={() => setLibParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
                  >
                    {partLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && <div className="auth-error" style={{ margin: '12px 18px 0' }}>{error}</div>}
          {flash && <div style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--teal)' }}>{flash}</div>}

          {libTab === 'foods' && (
            foods.length === 0 ? (
              <div className="empty"><b>No foods yet</b>Save a food and its calories to log it in one tap.</div>
            ) : foodsView.length === 0 ? noMatch : (
              <div className="stack">
                {foodsView.map((f) => (
                  <div key={f._id} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div style={{ fontWeight: 500 }}>{f.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--amber)' }}>{fcal(f.calories)}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {qtyInput(f._id)}
                      <button className="btn sm" onClick={() => addFood(f)}>Add</button>
                      {actions(() => setFoodModal(f), () => removeFood(f._id))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {libTab === 'workouts' && (
            workouts.length === 0 ? (
              <div className="empty"><b>No workouts yet</b>Save a workout with its calories burned and reps or duration.</div>
            ) : workoutsView.length === 0 ? noMatch : (
              <div className="stack">
                {workoutsView.map((w) => (
                  <div key={w._id} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{measureText(w) || '—'}</div>
                      <div style={{ marginTop: 4 }}><PartTags parts={partsOf(w)} /></div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--teal)' }}>−{fcal(w.calories)}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {qtyInput(w._id)}
                      <button className="btn sm" onClick={() => addWorkout(w)}>Burn</button>
                      {actions(() => setWorkoutModal(w), () => removeWorkout(w._id))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {libTab === 'sets' && (
            sets.length === 0 ? (
              <div className="empty"><b>No sets yet</b>Group workouts into a routine and burn the whole thing at once.</div>
            ) : setsView.length === 0 ? noMatch : (
              <div className="stack">
                {setsView.map((s) => (
                  <div key={s._id} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                        {(s.items || []).length === 0
                          ? 'No workouts in this set'
                          : (s.items || []).map((it) => {
                            const w = workoutsById.get(String(it.workoutId));
                            return w ? `${w.name}${Number(it.times) > 1 ? ` ×${it.times}` : ''}` : null;
                          }).filter(Boolean).join(' · ')}
                      </div>
                      <div style={{ marginTop: 4 }}><PartTags parts={setParts(s, workoutsById)} /></div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--teal)' }}>−{fcal(setTotal(s, workoutsById))}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {qtyInput(s._id)}
                      <button className="btn sm" onClick={() => addSet(s)}>Burn</button>
                      {actions(() => setSetModal(s), () => removeSet(s._id))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <div className="card">
        <div className="card-h"><h2>{isFiltered ? 'Entries' : 'All entries'}</h2></div>
        {filtered.length === 0 ? (
          <div className="empty"><b>Nothing logged yet</b>Log what you eat and the workouts you burn it off with.</div>
        ) : (
          <div className="stack">
            {filtered.map((e) => (
              <div key={e._id} className="row">
                <div className="d">{e.date}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{e.name || (e.type === 'burn' ? 'Burned' : 'Eaten')}</div>
                  {e.note && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{e.note}</div>}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: e.type === 'burn' ? 'var(--teal)' : 'var(--amber)' }}>
                  {e.type === 'burn' ? '−' : '+'}{fcal(e.calories)}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {e.source && e.source !== 'manual' && <span className="tag" title="Added from your saved list">{e.source}</span>}
                  {viewingSelf && (
                    <>
                      <button className="btn ghost sm" onClick={() => setEditing(e)}>Edit</button>
                      <button className="btn danger sm" onClick={() => removeEntry(e._id)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing._id ? 'Edit entry' : editing.type === 'burn' ? 'Burn calories' : 'Add calories'}
          fields={ENTRY_FIELDS}
          initial={editing}
          onSubmit={saveEntry}
          onClose={() => setEditing(null)}
        />
      )}

      {foodModal && (
        <FormModal
          title={foodModal._id ? 'Edit food' : 'New food'}
          fields={FOOD_FIELDS}
          initial={foodModal}
          onSubmit={saveFood}
          onClose={() => setFoodModal(null)}
        />
      )}

      {workoutModal && (
        <WorkoutModal workout={workoutModal} onSave={saveWorkout} onClose={() => setWorkoutModal(null)} />
      )}

      {setModal && (
        <SetModal set={setModal} workouts={workouts} onSave={saveSet} onClose={() => setSetModal(null)} />
      )}
    </main>
  );
}

// Workout: name, calories burned, and whether it's counted in repetitions
// or in duration (minutes). A bespoke form rather than FormModal because the
// amount field's label depends on which one is picked.
function WorkoutModal({ workout, onSave, onClose }) {
  const isNew = !workout?._id;
  const [values, setValues] = useState({
    name: workout.name || '',
    calories: workout.calories ?? '',
    measure: workout.measure || 'repetition',
    amount: workout.amount ?? '',
    bodyParts: partsOf(workout),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setValues((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: values.name.trim(),
        calories: Math.max(0, Number(values.calories) || 0),
        measure: values.measure,
        amount: Math.max(0, Number(values.amount) || 0),
        bodyParts: values.bodyParts,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'New workout' : 'Edit workout'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn" form="workout-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="workout-form" onSubmit={submit}>
        <div className="field-grid">
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Workout name</label>
            <input className="field" required value={values.name} placeholder="e.g. Push-ups" onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Calories burned (kcal)</label>
            <input className="field" type="number" min="0" step="0.01" required value={values.calories} onChange={(e) => set('calories', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Counted by</label>
            <select className="field" value={values.measure} onChange={(e) => set('measure', e.target.value)}>
              <option value="repetition">Repetitions</option>
              <option value="duration">Duration</option>
            </select>
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>{values.measure === 'duration' ? 'Duration (minutes)' : 'Repetitions'}</label>
            <input className="field" type="number" min="0" step="1" value={values.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Good for (pick any)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BODY_PARTS.map((p) => {
                const on = values.bodyParts.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`btn ${on ? '' : 'ghost'} sm`}
                    aria-pressed={on}
                    onClick={() => set('bodyParts', on ? values.bodyParts.filter((x) => x !== p) : [...values.bodyParts, p])}
                  >
                    {partLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10 }}>
          The calories are what one round of this amount burns, e.g. 20 repetitions = 8 kcal.
        </div>
      </form>
    </Modal>
  );
}

// Set: a named list of workouts, each with how many rounds of it. The
// "Total burned" figure updates live as workouts are added or changed.
function SetModal({ set, workouts, onSave, onClose }) {
  const isNew = !set?._id;
  const [name, setName] = useState(set.name || '');
  const [rows, setRows] = useState(() => (set.items || []).map((it) => ({ workoutId: String(it.workoutId), times: it.times ?? 1 })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map(workouts.map((w) => [String(w._id), w])), [workouts]);
  const total = round2(rows.reduce((s, r) => {
    const w = byId.get(r.workoutId);
    return s + (w ? Number(w.calories || 0) * Math.max(1, Number(r.times) || 1) : 0);
  }, 0));

  const parts = setParts({ items: rows }, byId);

  function patchRow(i, patch) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.workoutId));
    const next = workouts.find((w) => !used.has(String(w._id))) || workouts[0];
    if (next) setRows((rs) => [...rs, { workoutId: String(next._id), times: 1 }]);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        items: rows
          .filter((r) => byId.has(r.workoutId))
          .map((r) => ({ workoutId: r.workoutId, times: Math.max(1, Math.round(Number(r.times) || 1)) })),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'New set' : 'Edit set'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn" form="set-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="set-form" onSubmit={submit}>
        <div className="field-grid">
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Set name</label>
            <input className="field" required value={name} placeholder="e.g. Morning routine" onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--ink3)' }}>Workouts in this set</label>
          {workouts.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              <b>No workouts saved yet</b>Create a workout first, then add it to a set.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {rows.map((r, i) => {
                  const w = byId.get(r.workoutId);
                  const sub = w ? round2(Number(w.calories || 0) * Math.max(1, Number(r.times) || 1)) : 0;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select className="field" style={{ flex: 1, minWidth: 0 }} value={r.workoutId} onChange={(e) => patchRow(i, { workoutId: e.target.value })}>
                        {workouts.map((x) => (
                          <option key={x._id} value={x._id}>{x.name}{measureText(x) ? ` (${measureText(x)})` : ''}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>×</span>
                      <input className="field" type="number" min="1" step="1" style={{ width: 62 }} value={r.times} onChange={(e) => patchRow(i, { times: e.target.value })} title="Rounds" />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)', minWidth: 70, textAlign: 'right' }}>{fcal(sub)}</span>
                      <button type="button" className="btn danger sm" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} aria-label="Remove workout">×</button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={addRow}>+ Add workout</button>
            </>
          )}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Good for</span>
            {parts.length ? <PartTags parts={parts} /> : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Total burned</span>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 22, color: 'var(--teal)' }}>{fcal(total)}</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// One card holding both the calendar and the graph, since they're two
// readings of the same bucketed data — switching views keeps your place.
function CalorieExplorer({ buckets, leadingBlanks, title, granularity, setGranularity, view, setView, onPrev, onNext, onToday, onCellClick, selectedKeys }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <h2>Net calories over time</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([val, label]) => (
            <button key={val} className={`btn ${granularity === val ? '' : 'ghost'} sm`} onClick={() => setGranularity(val)}>{label}</button>
          ))}
          <span style={{ width: 1, background: 'var(--line)', margin: '0 2px' }} />
          {[['calendar', 'Calendar'], ['graph', 'Graph']].map(([val, label]) => (
            <button key={val} className={`btn ${view === val ? '' : 'ghost'} sm`} onClick={() => setView(val)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="card-b">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
          {granularity !== 'year' && <button className="btn ghost sm" onClick={onPrev}>←</button>}
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{title}</div>
          {granularity !== 'year' && <button className="btn ghost sm" onClick={onNext}>→</button>}
          {granularity !== 'year' && <button className="btn ghost sm" onClick={onToday}>Today</button>}
        </div>
        {view === 'calendar'
          ? <NetCalendar buckets={buckets} leadingBlanks={leadingBlanks} granularity={granularity} selectedKeys={selectedKeys} onCellClick={onCellClick} />
          : <NetGraph buckets={buckets} />}
      </div>
    </div>
  );
}

// Each cell shows that day's net (eaten − burned): amber for a surplus,
// teal for a deficit, plain for a day with nothing logged. Click toggles a
// cell into the filter, shift-click extends the selection.
function NetCalendar({ buckets, leadingBlanks, granularity, selectedKeys, onCellClick }) {
  const cells = granularity === 'day' ? [...Array(leadingBlanks).fill(null), ...buckets] : buckets;
  return (
    <div>
      {granularity === 'day' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
          {WEEKDAY_NAMES.map((w, i) => (
            <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>{w}</div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${granularity === 'day' ? 7 : granularity === 'month' ? 4 : Math.min(cells.length, 6)}, 1fr)`, gap: 6 }}>
        {cells.map((b, i) => {
          if (!b) return <div key={`blank-${i}`} />;
          const touched = b.intake !== 0 || b.burn !== 0;
          const surplus = b.net > 0;
          const selected = selectedKeys.has(b.key);
          return (
            <div
              key={b.key}
              onClick={(e) => onCellClick(b, e.shiftKey)}
              title={`${touched ? `Eaten ${fcal(b.intake)} · Burned ${fcal(b.burn)} · Net ${fnet(b.net)} kcal` : 'Nothing logged'} · click to filter, shift-click to select a range`}
              style={{
                borderRadius: 8, padding: granularity === 'day' ? '6px 4px' : '12px 8px', minHeight: granularity === 'day' ? 44 : 60,
                display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer',
                background: !touched ? 'var(--sunk)' : surplus ? 'var(--amber-t)' : 'var(--teal-t)',
                border: selected ? '2px solid var(--indigo)' : '1px solid var(--line)',
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink3)' }}>{b.label}</span>
              {touched && (
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: granularity === 'day' ? 10.5 : 13, color: surplus ? 'var(--amber)' : 'var(--teal)' }}>
                  {fnet(b.net)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
        Net = eaten − burned. Amber is a surplus, teal a deficit. Click a cell to filter by it, shift-click to select a range.
      </div>
    </div>
  );
}

// Baseline bar chart — amber above the line for a surplus, teal below it
// for a deficit. Hand-rolled to match how the rest of the app draws bars.
function NetGraph({ buckets }) {
  const maxAbs = Math.max(...buckets.map((b) => Math.abs(b.net)), 1);
  const plotHeight = 160;
  const showEveryLabel = buckets.length <= 14;
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: plotHeight + 24, gap: buckets.length > 40 ? 1 : 3 }}>
      {buckets.map((b, i) => {
        const h = Math.round((Math.abs(b.net) / maxAbs) * (plotHeight / 2));
        const surplus = b.net >= 0;
        return (
          <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
            <div style={{ height: plotHeight / 2, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              {surplus && <div title={`${fnet(b.net)} kcal`} style={{ width: '100%', minWidth: 2, height: Math.max(h, b.net !== 0 ? 2 : 0), background: 'var(--amber)', borderRadius: '2px 2px 0 0' }} />}
            </div>
            <div style={{ width: '100%', height: 1, background: 'var(--line2)' }} />
            <div style={{ height: plotHeight / 2, display: 'flex', alignItems: 'flex-start', width: '100%' }}>
              {!surplus && <div title={`${fnet(b.net)} kcal`} style={{ width: '100%', minWidth: 2, height: Math.max(h, b.net !== 0 ? 2 : 0), background: 'var(--teal)', borderRadius: '0 0 2px 2px' }} />}
            </div>
            {(showEveryLabel || i % Math.ceil(buckets.length / 12) === 0) && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink3)', marginTop: 4 }}>{b.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
