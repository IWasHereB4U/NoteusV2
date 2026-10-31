import { useMemo, useState } from 'react';
import { api, mediaUrl } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { TagChip, tint, TAG_COLORS } from '../components/TagChip.jsx';
import { PlaceField } from '../components/maps/PlaceField.jsx';
import { PoiMap } from '../components/maps/PoiMap.jsx';
import { MediaLibrary } from '../components/notes/MediaLibrary.jsx';
import { shortLabel } from '../api/geo.js';
import { WEEKDAYS, describeSchedule, scheduleStatus } from '../utils/poiSchedule.js';

const DEFAULT_COLOR = '#0E9C92';

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The same round badge as the map pin: the photo if there is one, otherwise
// a flag on the POI's tag color.
function PoiThumb({ poi, color, large }) {
  const url = poi?.imageUrl;
  return (
    <span className={'poi-thumb' + (large ? ' lg' : '')} style={{ '--pin': color || DEFAULT_COLOR }}>
      {url ? <img src={mediaUrl(url)} alt="" /> : '⚑'}
    </span>
  );
}

function StatusChip({ schedule }) {
  const st = scheduleStatus(schedule);
  if (!st) return null;
  return <span className={`poi-status ${st.tone}`}>{st.label}</span>;
}

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------

function PoiModal({ initial, tags, onSubmit, onCreateTag, onClose }) {
  const sched = initial?.schedule || { mode: 'none' };
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [place, setPlace] = useState(initial?.place || null);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || '');
  const [tagIds, setTagIds] = useState(initial?.tags || []);
  const [mode, setMode] = useState(sched.mode || 'none'); // 'none' | 'daily' | 'once'
  const [days, setDays] = useState(() => {
    const o = {};
    WEEKDAYS.forEach(({ n }) => {
      const found = (sched.days || []).find((d) => d.day === n);
      o[n] = found ? { on: true, start: found.start, end: found.end } : { on: false, start: '09:00', end: '17:00' };
    });
    return o;
  });
  const [once, setOnce] = useState({
    startDate: sched.startDate || todayStr(),
    endDate: sched.endDate || todayStr(),
    startTime: sched.startTime || '09:00',
    endTime: sched.endTime || '17:00',
  });
  const [picking, setPicking] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setDay = (n, patch) => setDays((d) => ({ ...d, [n]: { ...d[n], ...patch } }));
  const checked = WEEKDAYS.filter((w) => days[w.n].on);

  function toggleTag(id) {
    setTagIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function addTag() {
    const n = newTagName.trim();
    if (!n) return;
    const existing = tags.find((t) => t.name.trim().toLowerCase() === n.toLowerCase());
    if (existing) {
      setTagIds((cur) => (cur.includes(existing._id) ? cur : [...cur, existing._id]));
    } else {
      try {
        const created = await onCreateTag(n);
        setTagIds((cur) => [...cur, created._id]);
      } catch (err) {
        return setError(err.message || 'Could not create the tag');
      }
    }
    setNewTagName('');
    setNewTagOpen(false);
  }

  // Copy the first ticked day's hours onto every other ticked day.
  function sameHours() {
    const first = checked[0];
    if (!first) return;
    const { start, end } = days[first.n];
    setDays((d) => {
      const next = { ...d };
      checked.forEach((w) => { next[w.n] = { ...next[w.n], start, end }; });
      return next;
    });
  }

  function buildSchedule() {
    if (mode === 'daily') {
      if (checked.length === 0) throw new Error('Tick at least one day for the daily schedule.');
      if (checked.some((w) => !days[w.n].start || !days[w.n].end)) throw new Error('Set a start and end time for every ticked day.');
      return { mode: 'daily', days: checked.map((w) => ({ day: w.n, start: days[w.n].start, end: days[w.n].end })) };
    }
    if (mode === 'once') {
      const { startDate, endDate, startTime, endTime } = once;
      if (!startDate || !endDate || !startTime || !endTime) throw new Error('Fill in the start/end day and start/end time.');
      if (endDate < startDate) throw new Error('The end day is before the start day.');
      return { mode: 'once', startDate, endDate, startTime, endTime };
    }
    return { mode: 'none' };
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Give the place a name.');
    if (!place) return setError('Search and pick where it is on the map.');
    let schedule;
    try {
      schedule = buildSchedule();
    } catch (err) {
      return setError(err.message);
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        place,
        imageUrl,
        tags: tagIds.filter((id) => tags.some((t) => t._id === id)),
        schedule,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        title={initial?._id ? 'Edit point of interest' : 'Add point of interest'}
        onClose={onClose}
        width={620}
        footer={
          <>
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn" form="poi-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        }
      >
        {error && <div className="auth-error">{error}</div>}
        <form id="poi-form" onSubmit={submit}>
          <div className="field-row">
            <label>Name</label>
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cubao Expo night market" />
          </div>
          <div className="field-row">
            <label>Description</label>
            <textarea className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's here? Anything worth remembering." />
          </div>
          <div className="field-row">
            <label>Location</label>
            <PlaceField value={place} onChange={setPlace} placeholder="Search for the place…" />
          </div>

          <div className="field-row">
            <label>Photo <span className="opt">(optional — used as the pin on the map)</span></label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <PoiThumb poi={{ imageUrl }} large />
              <button type="button" className="btn ghost sm" onClick={() => setPicking(true)}>
                {imageUrl ? 'Change photo' : 'Choose or upload'}
              </button>
              {imageUrl && <button type="button" className="btn ghost sm" onClick={() => setImageUrl('')}>Remove</button>}
            </div>
          </div>

          <div className="field-row">
            <label>Tags <span className="opt">(Note Tag categories)</span></label>
            <div className="chip-wrap">
              {tags.length === 0 && !newTagOpen && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No tags yet.</span>}
              {tags.map((t) => (
                <TagChip key={t._id} tag={t} selected={tagIds.includes(t._id)} onClick={() => toggleTag(t._id)} />
              ))}
              {!newTagOpen && (
                <button type="button" className="tag-chip pick" style={{ borderStyle: 'dashed' }} onClick={() => setNewTagOpen(true)}>
                  + New tag
                </button>
              )}
            </div>
            {newTagOpen && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  className="field"
                  autoFocus
                  placeholder="New tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn sm" onClick={addTag} disabled={!newTagName.trim()}>Add</button>
                <button type="button" className="btn ghost sm" onClick={() => { setNewTagOpen(false); setNewTagName(''); }}>Cancel</button>
              </div>
            )}
          </div>

          <div className="field-row">
            <label>When is it open / on?</label>
            <div className="seg" role="radiogroup" aria-label="Schedule type">
              {[['none', 'No schedule'], ['daily', 'Daily'], ['once', 'One time']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={mode === val}
                  className={mode === val ? 'on' : ''}
                  onClick={() => setMode(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'daily' && (
            <div className="sched-box">
              <div className="sched-hint">Repeats every week. Tick the days and set the hours for each.</div>
              {WEEKDAYS.map((w) => {
                const d = days[w.n];
                return (
                  <div key={w.n} className={'sched-day' + (d.on ? ' on' : '')}>
                    <label className="sched-check">
                      <input type="checkbox" checked={d.on} onChange={(e) => setDay(w.n, { on: e.target.checked })} />
                      {w.long}
                    </label>
                    <input className="field sm" type="time" value={d.start} disabled={!d.on} onChange={(e) => setDay(w.n, { start: e.target.value })} aria-label={`${w.long} start time`} />
                    <span className="sched-to">to</span>
                    <input className="field sm" type="time" value={d.end} disabled={!d.on} onChange={(e) => setDay(w.n, { end: e.target.value })} aria-label={`${w.long} end time`} />
                  </div>
                );
              })}
              {checked.length > 1 && (
                <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={sameHours}>
                  Use {checked[0].short}'s hours for all ticked days
                </button>
              )}
            </div>
          )}

          {mode === 'once' && (
            <div className="sched-box">
              <div className="sched-hint">Happens once, over a range of days, at the same hours each day.</div>
              <div className="field-grid">
                <div className="field-row">
                  <label>Start day</label>
                  <input className="field" type="date" value={once.startDate} onChange={(e) => setOnce((o) => ({ ...o, startDate: e.target.value, endDate: o.endDate < e.target.value ? e.target.value : o.endDate }))} />
                </div>
                <div className="field-row">
                  <label>End day</label>
                  <input className="field" type="date" min={once.startDate} value={once.endDate} onChange={(e) => setOnce((o) => ({ ...o, endDate: e.target.value }))} />
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <label>Start time</label>
                  <input className="field" type="time" value={once.startTime} onChange={(e) => setOnce((o) => ({ ...o, startTime: e.target.value }))} />
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <label>End time</label>
                  <input className="field" type="time" value={once.endTime} onChange={(e) => setOnce((o) => ({ ...o, endTime: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {picking && (
        <MediaLibrary
          onClose={() => setPicking(false)}
          onSelect={(asset) => {
            setPicking(false);
            if (asset.kind !== 'image') return setError('Pick an image — videos can\'t be used as a map pin.');
            setError('');
            setImageUrl(asset.url);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Poi() {
  const { items: pois, loading, reload, viewingId } = useResource('/pois');
  const { items: rawTags, reload: reloadTags } = useResource('/note-tags');
  const { viewingSelf } = useAuth();
  const va = viewingId || undefined;

  // Same A–Z tag order as the Note Tag page, so categories line up between modules.
  const tags = useMemo(
    () => [...rawTags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [rawTags]
  );
  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t._id, t])), [tags]);
  const tagRank = useMemo(() => Object.fromEntries(tags.map((t, i) => [t._id, i])), [tags]);
  const orderedTagIds = (p) => (p.tags || []).filter((id) => tagById[id]).sort((a, b) => tagRank[a] - tagRank[b]);
  const colorOf = (p) => tagById[orderedTagIds(p)[0]]?.color || DEFAULT_COLOR;

  const [query, setQuery] = useState('');
  const [filterTags, setFilterTags] = useState([]); // tag ids; '__none' = untagged
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null); // { poi? }
  const [error, setError] = useState('');

  const countByTag = useMemo(() => {
    const c = {};
    for (const p of pois) for (const id of p.tags || []) c[id] = (c[id] || 0) + 1;
    return c;
  }, [pois]);
  const untaggedCount = pois.filter((p) => !(p.tags || []).filter((id) => tagById[id]).length).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = new Set(filterTags);
    return pois
      .map((p) => ({ ...p, orderedTags: orderedTagIds(p) }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      .filter((p) => {
        if (wanted.size === 0) return true;
        if (wanted.has('__none') && p.orderedTags.length === 0) return true;
        return p.orderedTags.some((id) => wanted.has(id));
      })
      .sort((a, b) => {
        // Grouped by first tag (A–Z), untagged last, then by name.
        const ra = a.orderedTags.length ? tagRank[a.orderedTags[0]] : Infinity;
        const rb = b.orderedTags.length ? tagRank[b.orderedTags[0]] : Infinity;
        if (ra !== rb) return ra < rb ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois, query, filterTags, tagById, tagRank]);

  const selected = pois.find((p) => p._id === selectedId) || null;
  const selectedTags = selected ? orderedTagIds(selected).map((id) => tagById[id]) : [];

  function toggleFilter(id) {
    setFilterTags((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  async function save(values) {
    setError('');
    if (modal?.poi?._id) {
      await api.put(`/pois/${modal.poi._id}`, values, va);
    } else {
      const created = await api.post('/pois', values, va);
      setSelectedId(created._id);
    }
    await reload();
  }

  async function remove(p) {
    if (!confirm(`Remove "${p.name}"?`)) return;
    try {
      await api.del(`/pois/${p._id}`, va);
      if (selectedId === p._id) setSelectedId(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createTag(name) {
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    const created = await api.post('/note-tags', { name, color }, va);
    await reloadTags();
    return created;
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Places</div>
          <h1>Point of Interest</h1>
        </div>
        {viewingSelf && <button className="btn" onClick={() => setModal({})}>Add point of interest</button>}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="maps-layout">
        <div className="card maps-list">
          <div className="card-h">
            <h2>Places · {shown.length}{shown.length !== pois.length ? ` of ${pois.length}` : ''}</h2>
          </div>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <input className="field sm" placeholder="Search places…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {(tags.length > 0 || untaggedCount > 0) && pois.length > 0 && (
            <div className="chip-wrap" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
              {tags.map((t) => (
                <button
                  key={t._id}
                  type="button"
                  className="tag-chip pick"
                  onClick={() => toggleFilter(t._id)}
                  aria-pressed={filterTags.includes(t._id)}
                  style={filterTags.includes(t._id) ? { background: tint(t.color), color: t.color, borderColor: 'transparent' } : undefined}
                >
                  <span className="dot" style={{ background: t.color }} />
                  {t.name} <span style={{ opacity: 0.6 }}>{countByTag[t._id] || 0}</span>
                </button>
              ))}
              {untaggedCount > 0 && (
                <button
                  type="button"
                  className="tag-chip pick"
                  onClick={() => toggleFilter('__none')}
                  aria-pressed={filterTags.includes('__none')}
                  style={filterTags.includes('__none') ? { background: 'var(--line)', borderColor: 'transparent' } : undefined}
                >
                  Untagged <span style={{ opacity: 0.6 }}>{untaggedCount}</span>
                </button>
              )}
              {filterTags.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setFilterTags([])}>Clear</button>}
            </div>
          )}

          {pois.length === 0 ? (
            <div className="empty">
              <b>{loading ? 'Loading…' : 'No places yet'}</b>
              {!loading && (viewingSelf ? 'Add a point of interest and it shows up on the map.' : 'Nothing has been added here yet.')}
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">No places match the current search or filter.</div>
          ) : (
            <div className="poi-list-scroll">
              {shown.map((p, i) => {
                const group = p.orderedTags[0] || '__none';
                const prev = i > 0 ? shown[i - 1].orderedTags[0] || '__none' : null;
                const color = tagById[group]?.color || 'var(--ink3)';
                return (
                  <div key={p._id}>
                    {group !== prev && (
                      <div className="word-list-group" style={{ color }}>
                        <span className="dot" style={{ background: color }} />
                        {tagById[group]?.name || 'Untagged'}
                        <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>
                          {shown.filter((x) => (x.orderedTags[0] || '__none') === group).length}
                        </span>
                      </div>
                    )}
                    <button className={'poi-item' + (selectedId === p._id ? ' on' : '')} onClick={() => setSelectedId(p._id)}>
                      <PoiThumb poi={p} color={colorOf(p)} />
                      <span className="poi-item-body">
                        <span className="poi-item-name">{p.name}</span>
                        <span className="poi-item-sub">{describeSchedule(p.schedule) || shortLabel(p.place.label)}</span>
                      </span>
                      <StatusChip schedule={p.schedule} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="maps-detail">
          <div className="card">
            <PoiMap pois={shown} colorOf={colorOf} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="map-note">
              {shown.length === 0 ? 'Pins appear here once you add a place.' : 'Click a pin or a place in the list to see its details.'}
            </div>
          </div>

          {selected && (
            <div className="card">
              <div className="card-h">
                <h2>{selected.name}</h2>
                {viewingSelf && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setModal({ poi: selected })}>Edit</button>
                    <button className="btn danger sm" onClick={() => remove(selected)}>Remove</button>
                  </div>
                )}
              </div>
              <div className="poi-detail">
                {selected.imageUrl && <img className="poi-detail-img" src={mediaUrl(selected.imageUrl)} alt="" />}
                <div className="poi-detail-body">
                  {selectedTags.length > 0 && (
                    <div className="chip-wrap">{selectedTags.map((t) => <TagChip key={t._id} tag={t} small />)}</div>
                  )}
                  {selected.description && <p className="poi-desc">{selected.description}</p>}
                  <dl className="tcard-dl">
                    <dt>Where</dt><dd style={{ whiteSpace: 'normal' }}>{selected.place.label}</dd>
                    {selected.schedule?.mode !== 'none' && (
                      <>
                        <dt>{selected.schedule?.mode === 'once' ? 'Dates' : 'Hours'}</dt>
                        <dd style={{ whiteSpace: 'normal' }}>{describeSchedule(selected.schedule)} <StatusChip schedule={selected.schedule} /></dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <PoiModal
          initial={modal.poi}
          tags={tags}
          onSubmit={save}
          onCreateTag={createTag}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
