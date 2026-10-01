import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { MeetingWordPicker, WordChip, wordColor, tint } from '../components/MeetingWordPicker.jsx';

export const MEETING_STATUSES = ['Not Completed', 'Ongoing', 'Completed', 'Cancelled'];
export const STATUS_COLORS = {
  'Not Completed': '#8A8F8E',
  Ongoing: '#DB9A2F',
  Completed: '#1F9D6B',
  Cancelled: '#C0392B',
};

const GROUPS = [
  ['date', 'Date'],
  ['word', 'Tag'],
  ['category', 'Category'],
  ['none', 'None'],
];
const WHEN = [
  ['all', 'All'],
  ['upcoming', 'Upcoming'],
  ['past', 'Past'],
];

// View settings are a per-browser convenience; storage can be missing or
// blocked, so every access is guarded and the page works without it.
const PREFS_KEY = 'noteus_meetings_view';
const DEFAULT_PREFS = { group: 'date', dir: 'asc', when: 'all' };
function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(iso) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const text = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const diff = Math.round((date - new Date(new Date().toDateString())) / 86400000);
  const rel = { 0: 'Today', 1: 'Tomorrow', [-1]: 'Yesterday' }[diff];
  return rel ? `${rel} · ${text}` : text;
}

function timeRange(m) {
  if (!m.startTime) return m.endTime ? `until ${m.endTime}` : 'No time';
  return m.endTime ? `${m.startTime}–${m.endTime}` : m.startTime;
}

// Date then start time; meetings with no date always sink to the bottom,
// and within a day ones with no time come first (like all-day entries).
function compareWhen(a, b, dir) {
  if (!a.date !== !b.date) return a.date ? -1 : 1;
  const ka = `${a.date || ''} ${a.startTime || ''}`;
  const kb = `${b.date || ''} ${b.startTime || ''}`;
  const c = ka.localeCompare(kb);
  if (c) return dir === 'asc' ? c : -c;
  return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
}

export function Meetings() {
  const { items, reload, viewingId } = useResource('/meetings');
  const { items: words, reload: reloadWords } = useResource('/tag-words');
  const { items: rawTags } = useResource('/note-tags');
  const { viewingSelf } = useAuth();
  const va = viewingId || undefined;

  const [editing, setEditing] = useState(null);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [query, setQuery] = useState('');
  const [filterWords, setFilterWords] = useState([]); // word ids; '__none' = untagged

  function setPrefs(patch) {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }

  const tags = useMemo(
    () => [...rawTags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [rawTags]
  );
  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t._id, t])), [tags]);
  const wordById = useMemo(() => Object.fromEntries(words.map((w) => [w._id, w])), [words]);
  const colorOf = (id) => wordColor(wordById[id], tagById, tags);

  // A meeting's tags that still exist, ordered by category then A–Z.
  const wordRank = useMemo(() => {
    const rankOfTag = Object.fromEntries(tags.map((t, i) => [t._id, i]));
    const firstTagRank = (w) => Math.min(...(w.tags || []).map((id) => rankOfTag[id] ?? Infinity), Infinity);
    const sorted = [...words].sort(
      (a, b) => firstTagRank(a) - firstTagRank(b) || a.word.localeCompare(b.word, undefined, { sensitivity: 'base' })
    );
    return Object.fromEntries(sorted.map((w, i) => [w._id, i]));
  }, [words, tags]);
  const meetingWords = (m) =>
    (m.tagWords || []).filter((id) => wordById[id]).sort((a, b) => wordRank[a] - wordRank[b]);

  // How many meetings use each word — drives the filter chips.
  const usage = useMemo(() => {
    const counts = {};
    let untagged = 0;
    for (const m of items) {
      const ids = (m.tagWords || []).filter((id) => wordById[id]);
      if (!ids.length) untagged++;
      for (const id of ids) counts[id] = (counts[id] || 0) + 1;
    }
    return { counts, untagged };
  }, [items, wordById]);
  const usedWords = Object.keys(usage.counts).sort((a, b) => wordRank[a] - wordRank[b]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = todayIso();
    const wanted = new Set(filterWords);
    return items
      .filter((m) => {
        if (prefs.when === 'upcoming') return !m.date || m.date >= today;
        if (prefs.when === 'past') return m.date && m.date < today;
        return true;
      })
      .filter((m) => {
        if (!q) return true;
        const hay = [m.title, m.location, m.notes, ...(m.tagWords || []).map((id) => wordById[id]?.word)]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .filter((m) => {
        // Several filter chips on = a meeting shows if it has ANY of them.
        if (!wanted.size) return true;
        const ids = (m.tagWords || []).filter((id) => wordById[id]);
        if (wanted.has('__none') && !ids.length) return true;
        return ids.some((id) => wanted.has(id));
      })
      .sort((a, b) => compareWhen(a, b, prefs.dir));
  }, [items, query, filterWords, prefs.when, prefs.dir, wordById]);

  // Sections for the chosen grouping. Grouping by tag or category puts a
  // meeting in every group it belongs to (a meeting tagged "Acme" and
  // "Payroll" shows under both).
  const sections = useMemo(() => {
    if (prefs.group === 'none') return [{ key: 'all', label: null, items: shown }];
    if (prefs.group === 'date') {
      const map = new Map();
      for (const m of shown) {
        const k = m.date || '';
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(m);
      }
      return [...map].map(([k, list]) => ({
        key: k || '__nodate', label: dateLabel(k), today: k === todayIso(), items: list,
      }));
    }
    const map = new Map();
    const push = (k, m) => {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    };
    for (const m of shown) {
      const ids = meetingWords(m);
      if (prefs.group === 'word') {
        if (!ids.length) push('__none', m);
        ids.forEach((id) => push(id, m));
      } else {
        const cats = new Set(ids.flatMap((id) => (wordById[id].tags || []).filter((t) => tagById[t])));
        if (!cats.size) push('__none', m);
        cats.forEach((t) => push(t, m));
      }
    }
    const order = prefs.group === 'word'
      ? (k) => wordRank[k]
      : (k) => tags.findIndex((t) => t._id === k);
    return [...map]
      .sort(([a], [b]) => (a === '__none') - (b === '__none') || order(a) - order(b))
      .map(([k, list]) => {
        if (k === '__none') {
          return { key: k, label: prefs.group === 'word' ? 'Untagged' : 'No category', color: null, items: list };
        }
        return prefs.group === 'word'
          ? { key: k, label: wordById[k].word, color: colorOf(k), items: list }
          : { key: k, label: tagById[k].name, color: tagById[k].color, items: list };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, prefs.group, wordById, tagById, tags, wordRank]);

  async function save(values) {
    if (editing?._id) await api.put(`/meetings/${editing._id}`, values, va);
    else await api.post('/meetings', values, va);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Delete this meeting?')) return;
    await api.del(`/meetings/${id}`, va);
    reload();
  }

  async function setStatus(m, status) {
    if (status === m.status) return;
    await api.put(`/meetings/${m._id}`, { status }, va);
    reload();
  }

  async function createWord(word) {
    const created = await api.post('/tag-words', { word, tags: [] }, va);
    await reloadWords();
    return created;
  }

  function toggleFilter(id) {
    setFilterWords((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  const filtersOn = query.trim() || filterWords.length || prefs.when !== 'all';

  function renderRow(m, sectionKey) {
    const status = m.status || 'Not Completed';
    const ids = meetingWords(m);
    return (
      <div key={`${sectionKey}-${m._id}`} className="row" style={{ gridTemplateColumns: '120px 1fr auto auto' }}>
        <div className="d">
          {prefs.group !== 'date' && <div>{m.date || 'No date'}</div>}
          <div>{timeRange(m)}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{m.title}</div>
          {m.location && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>📍 {m.location}</div>}
          {m.notes && <div className="task-note">{m.notes}</div>}
          {ids.length > 0 && (
            <div className="chip-wrap" style={{ marginTop: 6 }}>
              {ids.map((id) => <WordChip key={id} word={wordById[id]} color={colorOf(id)} small />)}
            </div>
          )}
        </div>
        {viewingSelf ? (
          <select
            className="field sm"
            value={status}
            onChange={(e) => setStatus(m, e.target.value)}
            style={{
              color: STATUS_COLORS[status], borderColor: STATUS_COLORS[status],
              fontWeight: 600, fontSize: 11.5, width: 'auto',
            }}
          >
            {MEETING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className="tag" style={{ background: STATUS_COLORS[status], color: '#fff', fontSize: 11 }}>{status}</span>
        )}
        {viewingSelf ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost sm" onClick={() => setEditing(m)}>Edit</button>
            <button className="btn danger sm" onClick={() => remove(m._id)}>Delete</button>
          </div>
        ) : <span />}
      </div>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Calendar</div><h1>Meetings</h1></div>
        {viewingSelf && (
          <button className="btn" onClick={() => setEditing({ status: 'Not Completed', date: todayIso() })}>
            Add meeting
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-h" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2>Meetings · {shown.length}{shown.length !== items.length ? ` of ${items.length}` : ''}</h2>
          <div className="meet-toolbar">
            <Segmented label="Show" options={WHEN} value={prefs.when} onChange={(when) => setPrefs({ when })} />
            <Segmented label="Group" options={GROUPS} value={prefs.group} onChange={(group) => setPrefs({ group })} />
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setPrefs({ dir: prefs.dir === 'asc' ? 'desc' : 'asc' })}
              title="Sort by date and start time"
            >
              {prefs.dir === 'asc' ? 'Earliest first ↑' : 'Latest first ↓'}
            </button>
            <input
              className="field sm"
              placeholder="Search title, place, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 200 }}
            />
          </div>
        </div>

        {(usedWords.length > 0) && items.length > 0 && (
          <div className="chip-wrap" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600, marginRight: 2 }}>Filter</span>
            {usedWords.map((id) => {
              const on = filterWords.includes(id);
              const c = colorOf(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="tag-chip pick"
                  aria-pressed={on}
                  onClick={() => toggleFilter(id)}
                  style={on ? { background: tint(c), color: c, borderColor: 'transparent' } : undefined}
                >
                  <span className="dot" style={{ background: c }} />
                  {wordById[id].word} <span style={{ opacity: 0.6 }}>{usage.counts[id]}</span>
                </button>
              );
            })}
            {usage.untagged > 0 && (
              <button
                type="button"
                className="tag-chip pick"
                aria-pressed={filterWords.includes('__none')}
                onClick={() => toggleFilter('__none')}
                style={filterWords.includes('__none') ? { background: 'var(--line)', borderColor: 'transparent' } : undefined}
              >
                Untagged <span style={{ opacity: 0.6 }}>{usage.untagged}</span>
              </button>
            )}
            {filterWords.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setFilterWords([])}>Clear</button>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty"><b>Nothing scheduled</b>Add a meeting to keep it on the record.</div>
        ) : shown.length === 0 ? (
          <div className="empty">
            No meetings match{filtersOn ? ' the current filters' : ''}.
            {filtersOn && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn ghost sm"
                  onClick={() => { setQuery(''); setFilterWords([]); setPrefs({ when: 'all' }); }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="stack">
            {sections.flatMap((s) => [
              s.label && (
                <div
                  key={`h-${s.key}`}
                  className="word-list-group"
                  style={{ color: s.color || (s.today ? 'var(--teal)' : 'var(--ink2)') }}
                >
                  {s.color && <span className="dot" style={{ background: s.color }} />}
                  {s.label}
                  <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>{s.items.length}</span>
                </div>
              ),
              ...s.items.map((m) => renderRow(m, s.key)),
            ])}
          </div>
        )}
      </div>

      {editing && (
        <MeetingModal
          meeting={editing}
          words={words}
          tags={tags}
          onCreateWord={viewingSelf ? createWord : undefined}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600, marginRight: 2 }}>{label}</span>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          className={`btn sm ${value === k ? '' : 'ghost'}`}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function MeetingModal({ meeting, words, tags, onCreateWord, onSubmit, onClose }) {
  const [v, setV] = useState(() => ({
    title: meeting.title || '',
    date: meeting.date || '',
    startTime: meeting.startTime || '',
    endTime: meeting.endTime || '',
    location: meeting.location || '',
    status: meeting.status || 'Not Completed',
    notes: meeting.notes || '',
    tagWords: (meeting.tagWords || []).map(String),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!v.title.trim()) return setError('Title is required');
    if (v.startTime && v.endTime && v.endTime < v.startTime) return setError('End time is before the start time');
    setSaving(true);
    setError('');
    try {
      // Drop ids of words that have since been deleted.
      const live = new Set(words.map((w) => w._id));
      await onSubmit({ ...v, title: v.title.trim(), tagWords: v.tagWords.filter((id) => live.has(id)) });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={meeting._id ? 'Edit meeting' : 'Add meeting'}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="meeting-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="meeting-form" onSubmit={submit}>
        <div className="field-grid">
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Title</label>
            <input className="field" value={v.title} onChange={set('title')} required autoFocus />
          </div>
          <div className="field-row">
            <label>Date</label>
            <input className="field" type="date" value={v.date} onChange={set('date')} />
          </div>
          <div className="field-row">
            <label>Status</label>
            <select className="field" value={v.status} onChange={set('status')}>
              {MEETING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field-row">
            <label>Start time</label>
            <input className="field" type="time" value={v.startTime} onChange={set('startTime')} />
          </div>
          <div className="field-row">
            <label>End time</label>
            <input className="field" type="time" value={v.endTime} onChange={set('endTime')} />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Location (optional)</label>
            <input className="field" value={v.location} onChange={set('location')} placeholder="e.g. Conference Room B" />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Tags (Note Tag words)</label>
            <MeetingWordPicker
              words={words}
              tags={tags}
              value={v.tagWords}
              onChange={(tagWords) => setV((x) => ({ ...x, tagWords }))}
              onCreateWord={onCreateWord}
            />
          </div>
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Notes</label>
            <textarea className="field" value={v.notes} onChange={set('notes')} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
