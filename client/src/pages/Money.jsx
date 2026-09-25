import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal, Modal } from '../components/Modal.jsx';
import { KpiStrip } from '../components/KpiStrip.jsx';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function fm(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

function ymd(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  return { y, m, d };
}

// Local-date YYYY-MM-DD. Deliberately not toISOString().slice(0,10) —
// that converts to UTC first, which silently shows yesterday's date for
// several hours every evening anywhere ahead of UTC (e.g. the
// Philippines, UTC+8) — exactly the kind of "recurring money isn't
// reflecting" symptom this local helper avoids.
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FIELDS = [
  { k: 'type', label: 'Type', type: 'select', options: [['income', 'Income'], ['expense', 'Expense']], half: true },
  { k: 'status', label: 'Status', type: 'select', options: [['paid', 'Paid'], ['pending', 'Pending']], half: true },
  { k: 'date', label: 'Date', type: 'date', half: true },
  { k: 'category', label: 'Category', half: true },
  { k: 'amount', label: 'Amount', type: 'number', half: true, required: true },
  { k: 'note', label: 'Note', type: 'textarea' },
];

// --- Filtering ---
// Three ways to narrow the ledger, in priority order: a calendar selection
// (specific days/months/years picked by hand) beats a manual date range,
// which beats the quick today/month/year/all buttons. Only one is ever
// "active" at a time — picking one clears the others so they can't
// silently disagree about what's being shown.

function inPeriod(t, period) {
  if (period === 'all') return true;
  const now = new Date();
  const { y, m, d } = ymd(t.date);
  if (period === 'today') return y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
  if (period === 'month') return y === now.getFullYear() && m === now.getMonth() + 1;
  if (period === 'year') return y === now.getFullYear();
  return true;
}

function inRange(t, start, end) {
  if (start && t.date < start) return false;
  if (end && t.date > end) return false;
  return true;
}

// `sel` = { granularity, year, month, keys: Set<bucketKey> } — bucketKey is
// a day-of-month, a month number, or a year, matching whichever
// granularity the calendar was in when the selection was made.
function inSelection(t, sel) {
  const { y, m, d } = ymd(t.date);
  if (sel.granularity === 'day') return y === sel.year && m === sel.month && sel.keys.has(d);
  if (sel.granularity === 'month') return y === sel.year && sel.keys.has(m);
  return sel.keys.has(y);
}

// Groups transactions into buckets for whichever granularity is active —
// one bucket per day of the navigated month, per month of the navigated
// year, or per year seen in the data. Both the calendar grid and the bar
// graph read from this same shape so they never disagree with each other.
function buildBuckets(items, granularity, cursor) {
  const grouped = new Map();
  const bump = (key, t) => {
    const cur = grouped.get(key) || { income: 0, expense: 0 };
    if (t.type === 'income') cur.income += Number(t.amount || 0);
    else cur.expense += Number(t.amount || 0);
    grouped.set(key, cur);
  };

  if (granularity === 'day') {
    items.forEach((t) => {
      const { y, m, d } = ymd(t.date);
      if (y === cursor.year && m === cursor.month) bump(d, t);
    });
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const leadingBlanks = new Date(cursor.year, cursor.month - 1, 1).getDay();
    const buckets = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const v = grouped.get(d) || { income: 0, expense: 0 };
      buckets.push({ key: d, label: String(d), income: v.income, expense: v.expense, net: v.income - v.expense });
    }
    return { buckets, leadingBlanks, title: `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}` };
  }

  if (granularity === 'month') {
    items.forEach((t) => {
      const { y, m } = ymd(t.date);
      if (y === cursor.year) bump(m, t);
    });
    const buckets = [];
    for (let m = 1; m <= 12; m++) {
      const v = grouped.get(m) || { income: 0, expense: 0 };
      buckets.push({ key: m, label: MONTH_NAMES[m - 1], income: v.income, expense: v.expense, net: v.income - v.expense });
    }
    return { buckets, leadingBlanks: 0, title: String(cursor.year) };
  }

  // 'year' — every year that has entries, plus the cursor year so an empty
  // book still shows something to navigate from.
  items.forEach((t) => bump(ymd(t.date).y, t));
  const years = [...new Set([...grouped.keys(), cursor.year])].sort((a, b) => a - b);
  const buckets = years.map((y) => {
    const v = grouped.get(y) || { income: 0, expense: 0 };
    return { key: y, label: String(y), income: v.income, expense: v.expense, net: v.income - v.expense };
  });
  return { buckets, leadingBlanks: 0, title: 'All years' };
}

// --- Recurring rules ---

function describeFrequency(rule) {
  const f = rule.frequency || {};
  if (f.kind === 'eom') return 'End of every month';
  if (f.kind === 'monthlyDay') return `Day ${f.day} of every month`;
  if (f.kind === 'everyNDays') return `Every ${f.n} day${f.n === 1 ? '' : 's'}`;
  return '—';
}

export function Money() {
  const { items, reload } = useResource('/transactions');
  const { items: rules, reload: reloadRules } = useResource('/recurring-rules');
  const { viewingId, viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null);
  const [ruleModal, setRuleModal] = useState(null); // null closed | {} new | rule edit

  const [period, setPeriod] = useState('all'); // today | month | year | all
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [calendarSelection, setCalendarSelection] = useState(null); // { granularity, year, month, keys: Set }
  const lastClickedKeyRef = useRef(null);

  const [granularity, setGranularity] = useState('day'); // day | month | year
  const [explorerView, setExplorerView] = useState('calendar'); // calendar | graph
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  // No background scheduler exists — catch up any due recurring entries,
  // and promote any now-due pending transactions to paid, whenever the
  // page loads (own book only; viewing someone else's is read-only, so
  // there's nothing to generate). Passes our own local date rather than
  // letting the server derive "today" from its own clock — see
  // routes/recurringRules.js `run` for why that matters.
  useEffect(() => {
    if (!viewingSelf) return;
    api.post('/recurring-rules/run', { todayDate: localISODate() }).catch(() => {}).then(() => {
      reload();
      reloadRules();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingSelf]);

  const isFiltered = period !== 'all' || !!dateRange.start || !!dateRange.end || (calendarSelection && calendarSelection.keys.size > 0);

  const filtered = useMemo(() => {
    let list = items;
    if (calendarSelection && calendarSelection.keys.size > 0) list = list.filter((t) => inSelection(t, calendarSelection));
    else if (dateRange.start || dateRange.end) list = list.filter((t) => inRange(t, dateRange.start, dateRange.end));
    else list = list.filter((t) => inPeriod(t, period));
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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

  // Paid and pending are kept as separate books: "Net" is what's actually
  // landed, "Pending net" is what's still hanging. Both, along with
  // Income/Expenses, are always derived from `filtered` — whichever of
  // the three filters above is active, the KPI strip moves with it.
  const totals = useMemo(() => {
    const sum = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount || 0), 0);
    const paid = filtered.filter((t) => t.status !== 'pending');
    const pending = filtered.filter((t) => t.status === 'pending');
    const income = sum(paid, 'income');
    const expense = sum(paid, 'expense');
    const pendingIncome = sum(pending, 'income');
    const pendingExpense = sum(pending, 'expense');
    return { income, expense, net: income - expense, pendingNet: pendingIncome - pendingExpense, pendingCount: pending.length };
  }, [filtered]);

  const { buckets, leadingBlanks, title } = useMemo(() => buildBuckets(items, granularity, cursor), [items, granularity, cursor]);

  // Only highlight cells in the calendar if the selection was made in the
  // scope currently on screen — browsing to a different month/year keeps
  // the filter applied, it just stops visually highlighting cells that
  // aren't in view.
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
      return c; // year view spans everything — nothing to page through
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
  // from the last-clicked bucket to this one (inclusive), the same
  // convention as a file browser's multi-select — so "shift-selecting" a
  // run of days, months, or years takes one click plus a shift-click.
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

  async function save(values) {
    if (editing?._id) await api.put(`/transactions/${editing._id}`, values, viewingId || undefined);
    else await api.post('/transactions', values, viewingId || undefined);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Delete this entry?')) return;
    await api.del(`/transactions/${id}`, viewingId || undefined);
    reload();
  }

  async function saveRule(payload) {
    if (ruleModal?._id) await api.put(`/recurring-rules/${ruleModal._id}`, payload, viewingId || undefined);
    else await api.post('/recurring-rules', payload, viewingId || undefined);
    await reloadRules();
    // A new/edited rule may already be due (e.g. a startDate in the past)
    // — generate immediately instead of waiting for the next page load.
    await api.post('/recurring-rules/run', { todayDate: localISODate() }, viewingId || undefined).catch(() => {});
    await reload();
  }

  async function removeRule(id) {
    if (!confirm("Delete this recurring entry? Transactions it already generated stay in your ledger.")) return;
    await api.del(`/recurring-rules/${id}`, viewingId || undefined);
    reloadRules();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Ledger</div>
          <h1>Money</h1>
        </div>
        {viewingSelf && (
          <button className="btn" onClick={() => setEditing({ type: 'income', status: 'paid', date: localISODate(today) })}>
            Add entry
          </button>
        )}
      </div>

      <KpiStrip
        items={[
          { label: 'Income', value: fm(totals.income), cls: 'in' },
          { label: 'Expenses', value: fm(totals.expense), cls: 'out' },
          { label: 'Net', value: fm(totals.net) },
          { label: `Pending net${totals.pendingCount ? ` (${totals.pendingCount})` : ''}`, value: fm(totals.pendingNet), cls: 'due' },
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

      <MoneyExplorer
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
        fm={fm}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h2>Recurring</h2>
          {viewingSelf && <button className="btn ghost sm" onClick={() => setRuleModal({})}>+ Add recurring</button>}
        </div>
        {rules.length === 0 ? (
          <div className="empty"><b>No recurring entries</b>Set up rent, a subscription, or a paycheck to post automatically.</div>
        ) : (
          <div className="stack">
            {rules.map((r) => (
              <div key={r._id} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{r.note || r.category || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {describeFrequency(r)}{!r.active ? ' · paused' : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: r.type === 'income' ? 'var(--teal)' : 'var(--coral)' }}>
                  {r.type === 'income' ? '+' : '−'}{fm(r.amount)}
                </div>
                {viewingSelf && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setRuleModal(r)}>Edit</button>
                    <button className="btn danger sm" onClick={() => removeRule(r._id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h"><h2>{isFiltered ? 'Entries' : 'All entries'}</h2></div>
        {filtered.length === 0 ? (
          <div className="empty"><b>Nothing recorded yet</b>Log income and expenses as they happen.</div>
        ) : (
          <div className="stack">
            {filtered.map((t) => (
              <div key={t._id} className="row">
                <div className="d">{t.date}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{t.note || t.category || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{t.category}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: t.type === 'income' ? 'var(--teal)' : 'var(--coral)' }}>
                  {t.type === 'income' ? '+' : '−'}{fm(t.amount)}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {t.status === 'pending' && <span className="tag ochre">pending</span>}
                  {t.recurringRuleId && <span className="tag" title="Generated by a recurring rule">recurring</span>}
                  {viewingSelf && (
                    <>
                      <button className="btn ghost sm" onClick={() => setEditing(t)}>Edit</button>
                      <button className="btn danger sm" onClick={() => remove(t._id)}>Delete</button>
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
          title={editing._id ? 'Edit entry' : 'Add entry'}
          fields={FIELDS}
          initial={editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}

      {ruleModal && (
        <RecurringRuleModal
          rule={ruleModal}
          onSave={saveRule}
          onClose={() => setRuleModal(null)}
        />
      )}
    </main>
  );
}

// One card holding both the calendar and the graph, since they're two
// readings of the same bucketed data — switching views keeps your place
// (granularity, navigated month/year) instead of resetting it.
function MoneyExplorer({ buckets, leadingBlanks, title, granularity, setGranularity, view, setView, onPrev, onNext, onToday, onCellClick, selectedKeys, fm }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <h2>Net over time</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([val, label]) => (
            <button key={val} className={`btn ${granularity === val ? '' : 'ghost'} sm`} onClick={() => setGranularity(val)}>
              {label}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--line)', margin: '0 2px' }} />
          {[['calendar', 'Calendar'], ['graph', 'Graph']].map(([val, label]) => (
            <button key={val} className={`btn ${view === val ? '' : 'ghost'} sm`} onClick={() => setView(val)}>
              {label}
            </button>
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
          ? <NetCalendar buckets={buckets} leadingBlanks={leadingBlanks} granularity={granularity} fm={fm} selectedKeys={selectedKeys} onCellClick={onCellClick} />
          : <NetGraph buckets={buckets} fm={fm} />}
      </div>
    </div>
  );
}

// Day view lays cells into a 7-wide week grid; month/year views just wrap
// cells left to right — both read net > 0 as teal, net < 0 as coral, and
// an untouched bucket (no entries at all) as a plain empty cell. Every
// cell is clickable: click toggles it into the filter, shift-click
// extends the selection from the last-clicked cell.
function NetCalendar({ buckets, leadingBlanks, granularity, fm, selectedKeys, onCellClick }) {
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
          const touched = b.income !== 0 || b.expense !== 0;
          const positive = b.net > 0;
          const selected = selectedKeys.has(b.key);
          return (
            <div
              key={b.key}
              onClick={(e) => onCellClick(b, e.shiftKey)}
              title={`${touched ? `+${fm(b.income)} / −${fm(b.expense)} = ${fm(b.net)}` : 'No entries'} · click to filter, shift-click to select a range`}
              style={{
                borderRadius: 8, padding: granularity === 'day' ? '6px 4px' : '12px 8px', minHeight: granularity === 'day' ? 44 : 60,
                display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer',
                background: !touched ? 'var(--sunk)' : positive ? 'var(--teal-t)' : 'var(--coral-t)',
                border: selected ? '2px solid var(--indigo)' : '1px solid var(--line)',
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink3)' }}>{b.label}</span>
              {touched && (
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: granularity === 'day' ? 10.5 : 13, color: positive ? 'var(--teal)' : 'var(--coral)' }}>
                  {fm(b.net)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
        Click a cell to filter by it, shift-click to select a range.
      </div>
    </div>
  );
}

// A plain baseline bar chart — one bar per bucket, teal above the line for
// a net gain, coral below it for a net loss, height scaled to the largest
// swing in the visible range. Hand-rolled (no SVG library dependency) to
// match how the rest of the app draws its bars.
function NetGraph({ buckets, fm }) {
  const maxAbs = Math.max(...buckets.map((b) => Math.abs(b.net)), 1);
  const plotHeight = 160;
  const showEveryLabel = buckets.length <= 14;
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: plotHeight + 24, gap: buckets.length > 40 ? 1 : 3 }}>
      {buckets.map((b, i) => {
        const h = Math.round((Math.abs(b.net) / maxAbs) * (plotHeight / 2));
        const positive = b.net >= 0;
        return (
          <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
            <div style={{ height: plotHeight / 2, display: 'flex', alignItems: 'flex-end' }}>
              {positive && <div title={fm(b.net)} style={{ width: '100%', minWidth: 2, height: Math.max(h, b.net !== 0 ? 2 : 0), background: 'var(--teal)', borderRadius: '2px 2px 0 0' }} />}
            </div>
            <div style={{ width: '100%', height: 1, background: 'var(--line2)' }} />
            <div style={{ height: plotHeight / 2, display: 'flex', alignItems: 'flex-start' }}>
              {!positive && <div title={fm(b.net)} style={{ width: '100%', minWidth: 2, height: Math.max(h, b.net !== 0 ? 2 : 0), background: 'var(--coral)', borderRadius: '0 0 2px 2px' }} />}
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

// A bespoke form (not FormModal) because the fields shown depend on which
// frequency kind is picked — FormModal only knows how to render a flat,
// unconditional field list.
function RecurringRuleModal({ rule, onSave, onClose }) {
  const isNew = !rule?._id;
  const [values, setValues] = useState({
    type: rule.type || 'expense',
    status: rule.status || 'paid',
    category: rule.category || '',
    note: rule.note || '',
    amount: rule.amount ?? '',
    kind: rule.frequency?.kind || 'monthlyDay',
    day: rule.frequency?.day ?? 1,
    n: rule.frequency?.n ?? 30,
    startDate: rule.startDate || localISODate(),
    endDate: rule.endDate || '',
    active: rule.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) {
    setValues((x) => ({ ...x, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        type: values.type,
        status: values.status,
        category: values.category,
        note: values.note,
        amount: Number(values.amount) || 0,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        active: values.active,
        frequency:
          values.kind === 'eom' ? { kind: 'eom' }
            : values.kind === 'everyNDays' ? { kind: 'everyNDays', n: Math.max(1, Number(values.n) || 1) }
              : { kind: 'monthlyDay', day: Math.min(31, Math.max(1, Number(values.day) || 1)) },
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'Add recurring entry' : 'Edit recurring entry'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn" form="recurring-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="recurring-form" onSubmit={submit}>
        <div className="field-grid">
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Type</label>
            <select className="field" value={values.type} onChange={(e) => set('type', e.target.value)}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Status</label>
            <select className="field" value={values.status} onChange={(e) => set('status', e.target.value)}>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Category</label>
            <input className="field" value={values.category} onChange={(e) => set('category', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Amount</label>
            <input className="field" type="number" step="0.01" required value={values.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Active</label>
            <select className="field" value={values.active ? 'yes' : 'no'} onChange={(e) => set('active', e.target.value === 'yes')}>
              <option value="yes">Yes</option>
              <option value="no">Paused</option>
            </select>
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Note</label>
            <textarea className="field" value={values.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Repeats</label>
            <select className="field" value={values.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="monthlyDay">On a day of the month</option>
              <option value="eom">End of every month</option>
              <option value="everyNDays">Every N days</option>
            </select>
          </div>
          {values.kind === 'monthlyDay' && (
            <div className="field-row" style={{ gridColumn: 'span 1' }}>
              <label>Day of month</label>
              <input className="field" type="number" min="1" max="31" value={values.day} onChange={(e) => set('day', e.target.value)} />
            </div>
          )}
          {values.kind === 'everyNDays' && (
            <div className="field-row" style={{ gridColumn: 'span 1' }}>
              <label>Every N days</label>
              <input className="field" type="number" min="1" value={values.n} onChange={(e) => set('n', e.target.value)} />
            </div>
          )}
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>{values.kind === 'everyNDays' ? 'Anchor date' : 'Starting from'}</label>
            <input className="field" type="date" required value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 1' }}>
            <label>Ends on (optional)</label>
            <input className="field" type="date" value={values.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}