import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ROW_H = 44; // px per hour in day view
const COLORS = ['#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5'];
const STATUSES = ['Not Completed', 'Ongoing', 'Completed', 'Cancelled'];
const STATUS_COLORS = {
  'Not Completed': '#8A8F8E',
  Ongoing: '#DB9A2F',
  Completed: '#1F9D6B',
  Cancelled: '#C0392B',
};
const STATUS_MARK = { 'Not Completed': '', Ongoing: '● ', Completed: '✓ ', Cancelled: '✕ ' };

function iso(d) {
  // Build the date string from local components — toISOString() converts
  // to UTC first, which can silently shift the date by a day depending on
  // the browser's timezone.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sameDay(a, b) {
  return iso(a) === iso(b);
}
function minutesOf(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const EVENT_FIELDS = [
  { k: 'title', label: 'Title', required: true },
  { k: 'date', label: 'Date', type: 'date', half: true, required: true },
  { k: 'allDay', label: 'Timing', type: 'select', half: true, options: [['no', 'Timed'], ['yes', 'All day']] },
  { k: 'startTime', label: 'Start time', type: 'time', half: true },
  { k: 'endTime', label: 'End time', type: 'time', half: true },
  { k: 'location', label: 'Location (optional)', half: true, placeholder: 'e.g. Conference Room B' },
  { k: 'status', label: 'Status', type: 'select', half: true, options: STATUSES.map((s) => [s, s]) },
  { k: 'color', label: 'Color', type: 'colorpicker', options: COLORS.map((c) => [c, c]) },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];

export function Calendar() {
  const { items: events, reload, viewingId } = useResource('/calendar-events');
  const { items: meetings } = useResource('/meetings');
  const { viewingSelf } = useAuth();
  const [focusDate, setFocusDate] = useState(new Date());
  const [view, setView] = useState('month'); // 'month' | 'day'
  const [editing, setEditing] = useState(null);

  // Normalize both sources into one shape so the grid doesn't care where
  // an entry came from. Meetings are shown but not editable here — they
  // stay owned by the Meetings page.
  const allItems = useMemo(() => {
    const fromEvents = events.map((e) => ({
      id: e._id, kind: 'event', title: e.title, date: e.date,
      startTime: e.allDay ? null : e.startTime, endTime: e.endTime,
      allDay: e.allDay, color: e.color || COLORS[0], notes: e.notes, location: e.location,
      status: e.status || 'Not Completed', raw: e,
    }));
    const fromMeetings = meetings.map((m) => ({
      id: m._id, kind: 'meeting', title: m.title, date: m.date,
      startTime: m.startTime || null, endTime: m.endTime, allDay: !m.startTime,
      color: '#5B6EE1', notes: m.notes, location: m.location, status: m.status || 'Not Completed', raw: m,
    }));
    return [...fromEvents, ...fromMeetings];
  }, [events, meetings]);

  function itemsOn(date) {
    return allItems
      .filter((it) => it.date === iso(date))
      .sort((a, b) => (minutesOf(a.startTime) ?? -1) - (minutesOf(b.startTime) ?? -1));
  }

  async function save(values) {
    const payload = {
      title: values.title,
      date: values.date,
      allDay: values.allDay === 'yes',
      startTime: values.allDay === 'yes' ? '' : values.startTime,
      endTime: values.allDay === 'yes' ? '' : values.endTime,
      color: values.color,
      location: values.location,
      status: values.status,
      notes: values.notes,
    };
    if (editing?._id) await api.put(`/calendar-events/${editing._id}`, payload, viewingId || undefined);
    else await api.post('/calendar-events', payload, viewingId || undefined);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Delete this event?')) return;
    await api.del(`/calendar-events/${id}`, viewingId || undefined);
    reload();
  }

  async function setEventStatus(it, status) {
    if (it.kind !== 'event' || status === it.status) return;
    await api.put(`/calendar-events/${it.id}`, { status }, viewingId || undefined);
    reload();
  }

  function openDay(date) {
    setFocusDate(date);
    setView('day');
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Schedule</div><h1>Calendar</h1></div>
        {viewingSelf && (
          <button
            className="btn"
            onClick={() => setEditing({ date: iso(focusDate), color: COLORS[0], startTime: '09:00', endTime: '10:00', status: 'Not Completed' })}
          >
            + Add event
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={() => setFocusDate(new Date())}>Today</button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn ghost sm" onClick={() => shift(-1)}>‹</button>
          <button className="btn ghost sm" onClick={() => shift(1)}>›</button>
        </div>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 18 }}>
          {view === 'month'
            ? `${MONTH_NAMES[focusDate.getMonth()]} ${focusDate.getFullYear()}`
            : focusDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`btn sm ${view === 'month' ? '' : 'ghost'}`} onClick={() => setView('month')}>Month</button>
          <button className={`btn sm ${view === 'day' ? '' : 'ghost'}`} onClick={() => setView('day')}>Day</button>
        </div>
      </div>

      {view === 'month' ? (
        <MonthGrid focusDate={focusDate} itemsOn={itemsOn} onOpenDay={openDay} />
      ) : (
        <DayGrid
          date={focusDate}
          items={itemsOn(focusDate)}
          viewingSelf={viewingSelf}
          onEdit={(it) => it.kind === 'event' && setEditing(it.raw)}
          onDelete={(it) => it.kind === 'event' && remove(it.id)}
          onSetStatus={setEventStatus}
        />
      )}

      {editing && (
        <FormModal
          title={editing._id ? 'Edit event' : 'Add event'}
          fields={EVENT_FIELDS}
          initial={{ ...editing, allDay: editing.allDay ? 'yes' : 'no', status: editing.status || 'Not Completed' }}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );

  function shift(dir) {
    const d = new Date(focusDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir);
    setFocusDate(d);
  }
}

function MonthGrid({ focusDate, itemsOn, onOpenDay }) {
  const year = focusDate.getFullYear();
  const month = focusDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const today = new Date();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--line)' }}>
        {DOW.map((d) => (
          <div key={d} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === month;
          const items = itemsOn(d);
          const isToday = sameDay(d, today);
          return (
            <div
              key={iso(d)}
              onClick={() => onOpenDay(d)}
              style={{
                minHeight: 96, minWidth: 0, padding: 6, borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
                cursor: 'pointer', opacity: inMonth ? 1 : 0.4, background: isToday ? 'var(--teal-t)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--teal)' : 'var(--ink2)' }}>
                {d.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, minWidth: 0 }}>
                {items.slice(0, 3).map((it) => (
                  <div
                    key={it.id}
                    title={it.location ? `${it.status} · ${it.location}` : it.status}
                    style={{
                      fontSize: 10.5, padding: '1px 5px', borderRadius: 4, color: '#fff', width: '100%', minWidth: 0, boxSizing: 'border-box',
                      background: it.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      opacity: it.status === 'Cancelled' ? 0.45 : it.status === 'Completed' ? 0.75 : 1,
                      textDecoration: it.status === 'Cancelled' ? 'line-through' : 'none',
                      borderLeft: `3px solid ${STATUS_COLORS[it.status] || 'transparent'}`,
                    }}
                  >
                    {STATUS_MARK[it.status] || ''}{it.startTime ? `${it.startTime} ` : ''}{it.title}
                  </div>
                ))}
                {items.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayGrid({ date, items, viewingSelf, onEdit, onDelete, onSetStatus }) {
  const allDay = items.filter((it) => !it.startTime);
  const timed = items.filter((it) => it.startTime);
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="card">
      {allDay.length > 0 && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {allDay.map((it) => (
            <span
              key={it.id}
              className="tag"
              title={it.location || undefined}
              style={{
                background: it.color, color: '#fff',
                opacity: it.status === 'Cancelled' ? 0.45 : it.status === 'Completed' ? 0.75 : 1,
                textDecoration: it.status === 'Cancelled' ? 'line-through' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
              onClick={() => onEdit(it)}
            >
              {STATUS_MARK[it.status] || ''}{it.title}{it.kind === 'meeting' ? ' · meeting' : ''}{it.location ? ` · 📍 ${it.location}` : ''}
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '56px 1fr', maxHeight: '70vh', overflowY: 'auto' }}>
        <div>
          {hours.map((h) => (
            <div key={h} style={{ height: ROW_H, fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--mono)', textAlign: 'right', paddingRight: 8, borderTop: '1px solid var(--line)' }}>
              {h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          {hours.map((h) => (
            <div key={h} style={{ height: ROW_H, borderTop: '1px solid var(--line)' }} />
          ))}
          {timed.map((it) => {
            const startMin = minutesOf(it.startTime) ?? 0;
            const endMin = it.endTime ? minutesOf(it.endTime) : startMin + 30;
            const top = (startMin / 60) * ROW_H;
            const height = Math.max(18, ((endMin - startMin) / 60) * ROW_H - 2);
            return (
              <div
                key={it.id}
                onClick={() => onEdit(it)}
                style={{
                  position: 'absolute', left: 6, right: 6, top, height,
                  background: it.color, color: '#fff', borderRadius: 6, padding: '3px 8px',
                  fontSize: 12, overflow: 'hidden', cursor: it.kind === 'event' ? 'pointer' : 'default',
                  boxShadow: '0 2px 6px rgba(11,22,21,.2)',
                  opacity: it.status === 'Cancelled' ? 0.5 : it.status === 'Completed' ? 0.8 : 1,
                }}
              >
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: it.status === 'Cancelled' ? 'line-through' : 'none' }}>
                  {STATUS_MARK[it.status] || ''}{it.title}{it.kind === 'meeting' ? ' · meeting' : ''}
                </div>
                {height > 30 && (
                  <div style={{ fontSize: 10.5, opacity: 0.85 }}>
                    {it.startTime}{it.endTime ? `–${it.endTime}` : ''}{it.location ? ` · 📍 ${it.location}` : ''}
                  </div>
                )}
                {viewingSelf && it.kind === 'event' && height > 55 && (
                  <select
                    className="field sm"
                    value={it.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onSetStatus(it, e.target.value)}
                    style={{ marginTop: 4, width: 'auto', fontSize: 10.5, background: 'rgba(255,255,255,.2)', color: '#fff', border: 'none' }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} style={{ color: '#111' }}>{s}</option>
                    ))}
                  </select>
                )}
                {viewingSelf && it.kind === 'event' && height > 40 && (
                  <button
                    className="btn danger sm"
                    style={{ marginTop: 4, background: 'rgba(255,255,255,.2)', color: '#fff', border: 'none' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(it); }}
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
