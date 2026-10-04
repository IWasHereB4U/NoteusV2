import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { PlaceField } from '../components/maps/PlaceField.jsx';
import { RouteMap } from '../components/maps/RouteMap.jsx';
import { osrmRoute, shortLabel, fmtDistance, fmtDuration } from '../api/geo.js';

const MODES = [
  ['Walk', '🚶'], ['Jeepney', '🚐'], ['Bus', '🚌'], ['UV Express', '🚐'], ['Tricycle', '🛺'],
  ['Train', '🚆'], ['Taxi / TNVS', '🚕'], ['Ferry', '⛴️'], ['Car', '🚗'],
  ['Motorcycle', '🏍️'], ['Bike', '🚲'], ['Other', '🧭'],
];
const MODE_ICON = Object.fromEntries(MODES);
const ROUTE_COLORS = ['#5B6EE1', '#F1614B', '#0E9C92', '#DB9A2F', '#A253C9', '#2D8BCB'];

function peso(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Road geometry (OSRM) for every card in the selected destination, keyed by
// card _id. Re-runs only when a card's endpoints change; results are also
// cached module-wide in api/geo.js.
function useLegs(dest) {
  const [legs, setLegs] = useState({});
  const cards = useMemo(() => (dest?.routes || []).flatMap((r) => r.cards), [dest]);
  const sig = cards.map((c) => `${c._id}:${c.from.lat},${c.from.lon}>${c.to.lat},${c.to.lon}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLegs({});
    cards.forEach(async (c) => {
      try {
        const leg = await osrmRoute(c.from, c.to, ctrl.signal);
        if (!cancelled) setLegs((l) => ({ ...l, [c._id]: leg }));
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') setLegs((l) => ({ ...l, [c._id]: { error: err.message } }));
      }
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return legs;
}

function DestinationModal({ initial, onSubmit, onClose }) {
  const [from, setFrom] = useState(initial?.from || null);
  const [to, setTo] = useState(initial?.to || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!from || !to) return setError('Search and pick both a From and a To place.');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ from, to });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial?._id ? 'Edit destination' : 'Add destination'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="dest-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="dest-form" onSubmit={submit}>
        <div className="field-row"><label>From</label><PlaceField value={from} onChange={setFrom} placeholder="Where are you starting?" /></div>
        <div className="field-row"><label>To</label><PlaceField value={to} onChange={setTo} placeholder="Where are you going?" /></div>
      </form>
    </Modal>
  );
}

function RouteNameModal({ initial, onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ name: name.trim() });
      onClose();
    } catch {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={initial?._id ? 'Rename route' : 'Add route'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="route-form" disabled={saving || !name.trim()}>Save</button>
        </>
      }
    >
      <form id="route-form" onSubmit={submit}>
        <div className="field-row">
          <label>Route name</label>
          <input className="field" autoFocus required value={name} placeholder="e.g. Via Marcos Highway" onChange={(e) => setName(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

function CardModal({ initial, defaults, onSubmit, onClose }) {
  const [v, setV] = useState({
    mode: initial?.mode || 'Jeepney',
    name: initial?.name || '',
    price: initial?.price ?? '',
    updatedOn: initial?.updatedOn || todayStr(),
    from: initial?.from || defaults.from || null,
    to: initial?.to || defaults.to || null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e) {
    e.preventDefault();
    if (!v.from || !v.to) return setError('Search and pick both a From and a To place.');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ ...v, price: Number(v.price) || 0 });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial?._id ? 'Edit card' : 'Add card'}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="card-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="card-form" onSubmit={submit}>
        <div className="field-grid">
          <div className="field-row">
            <label>Mode of transportation</label>
            <select className="field" value={v.mode} onChange={(e) => set('mode', e.target.value)}>
              {MODES.map(([m, icon]) => <option key={m} value={m}>{icon} {m}</option>)}
            </select>
          </div>
          <div className="field-row">
            <label>Transportation name</label>
            <input className="field" value={v.name} placeholder="e.g. Angono–Cubao, LRT-2" onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field-row">
            <label>Price (₱)</label>
            <input className="field" type="number" min="0" step="0.01" value={v.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div className="field-row">
            <label>Date updated</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="field" type="date" required value={v.updatedOn} onChange={(e) => set('updatedOn', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn ghost sm" onClick={() => set('updatedOn', todayStr())}>Today</button>
            </div>
          </div>
        </div>
        <div className="field-row"><label>From</label><PlaceField value={v.from} onChange={(p) => set('from', p)} placeholder="Where do you board?" /></div>
        <div className="field-row"><label>To</label><PlaceField value={v.to} onChange={(p) => set('to', p)} placeholder="Where do you get off?" /></div>
      </form>
    </Modal>
  );
}

export function Maps() {
  const { items, loading, reload, viewingId } = useResource('/map-destinations');
  const { viewingSelf } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);
  const [modal, setModal] = useState(null); // {type:'dest'|'route'|'card', ...}
  const [error, setError] = useState('');

  const dest = items.find((d) => d._id === selectedId) || items[0] || null;
  const legs = useLegs(dest);

  // Give each route a stable color for both the map line and its list header.
  const routes = useMemo(
    () => (dest?.routes || []).map((r, i) => ({ ...r, color: ROUTE_COLORS[i % ROUTE_COLORS.length] })),
    [dest]
  );

  useEffect(() => setActiveRoute(null), [dest?._id]);

  const base = '/map-destinations';
  async function persist(id, body) {
    setError('');
    await api.put(`${base}/${id}`, body, viewingId || undefined);
    await reload();
  }
  const bodyOf = (d, routesArr = d.routes) => ({ from: d.from, to: d.to, routes: routesArr });
  const stripColor = (r) => ({ _id: r._id, name: r.name, cards: r.cards });

  async function saveDestination(values) {
    if (modal.dest?._id) return persist(modal.dest._id, { ...bodyOf(modal.dest), ...values });
    const created = await api.post(base, { ...values, routes: [] }, viewingId || undefined);
    setSelectedId(created._id);
    await reload();
  }

  async function removeDestination(d) {
    if (!confirm(`Remove ${shortLabel(d.from.label)} → ${shortLabel(d.to.label)} and all its routes?`)) return;
    try {
      await api.del(`${base}/${d._id}`, viewingId || undefined);
      setSelectedId(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveRoute(values) {
    const next = modal.route?._id
      ? routes.map((r) => (r._id === modal.route._id ? { ...stripColor(r), ...values } : stripColor(r)))
      : [...routes.map(stripColor), { ...values, cards: [] }];
    await persist(dest._id, bodyOf(dest, next));
  }

  async function removeRoute(route) {
    if (!confirm(`Remove route "${route.name}" and its cards?`)) return;
    try {
      await persist(dest._id, bodyOf(dest, routes.filter((r) => r._id !== route._id).map(stripColor)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCard(values) {
    const { route, card } = modal;
    const next = routes.map((r) => {
      if (r._id !== route._id) return stripColor(r);
      const cards = card?._id
        ? r.cards.map((c) => (c._id === card._id ? { ...c, ...values } : c))
        : [...r.cards, values];
      return { ...stripColor(r), cards };
    });
    await persist(dest._id, bodyOf(dest, next));
  }

  async function removeCard(route, card) {
    if (!confirm('Remove this card?')) return;
    try {
      const next = routes.map((r) =>
        r._id === route._id ? { ...stripColor(r), cards: r.cards.filter((c) => c._id !== card._id) } : stripColor(r)
      );
      await persist(dest._id, bodyOf(dest, next));
    } catch (err) {
      setError(err.message);
    }
  }

  function cardDefaults(route) {
    const last = route.cards[route.cards.length - 1];
    return { from: last ? last.to : dest.from, to: dest.to };
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Getting around</div>
          <h1>Maps</h1>
        </div>
        {viewingSelf && <button className="btn" onClick={() => setModal({ type: 'dest' })}>Add destination</button>}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="maps-layout">
        <div className="card maps-list">
          <div className="card-h"><h2>Destinations</h2></div>
          {items.length === 0 ? (
            <div className="empty">
              <b>{loading ? 'Loading…' : 'No destinations yet'}</b>
              {!loading && 'Add a From and To, then build the routes between them.'}
            </div>
          ) : (
            <div className="stack">
              {items.map((d) => (
                <button
                  key={d._id}
                  className={'dest-item' + (dest?._id === d._id ? ' on' : '')}
                  onClick={() => setSelectedId(d._id)}
                >
                  <span className="dest-ab"><i className="a">A</i>{shortLabel(d.from.label)}</span>
                  <span className="dest-ab"><i className="b">B</i>{shortLabel(d.to.label)}</span>
                  <span className="dest-meta">{d.routes.length} route{d.routes.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="maps-detail">
          {!dest ? (
            <div className="card"><div className="empty"><b>Pick or add a destination</b>Its map and routes show up here.</div></div>
          ) : (
            <>
              <div className="card">
                <div className="card-h">
                  <h2>{shortLabel(dest.from.label)} → {shortLabel(dest.to.label)}</h2>
                  {viewingSelf && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setModal({ type: 'dest', dest })}>Edit</button>
                      <button className="btn danger sm" onClick={() => removeDestination(dest)}>Remove</button>
                    </div>
                  )}
                </div>
                <RouteMap from={dest.from} to={dest.to} routes={routes} legs={legs} activeId={activeRoute} />
                <div className="map-note">
                  Route lines follow roads (OSRM driving profile) — rail, ferry and walking legs are approximate.
                </div>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2>Routes</h2>
                  {viewingSelf && <button className="btn sm" onClick={() => setModal({ type: 'route' })}>Add route</button>}
                </div>
                {routes.length === 0 ? (
                  <div className="empty"><b>No routes yet</b>Add one, then add a card for each leg of the trip.</div>
                ) : (
                  <div className="stack">
                    {routes.map((r) => {
                      const total = r.cards.reduce((s, c) => s + (Number(c.price) || 0), 0);
                      const loaded = r.cards.map((c) => legs[c._id]).filter((l) => l?.coords);
                      const dist = loaded.reduce((s, l) => s + l.distance, 0);
                      const dur = loaded.reduce((s, l) => s + l.duration, 0);
                      return (
                        <section
                          key={r._id}
                          className={'route-block' + (activeRoute === r._id ? ' on' : '')}
                          onMouseEnter={() => setActiveRoute(r._id)}
                          onMouseLeave={() => setActiveRoute(null)}
                        >
                          <div className="route-head">
                            <span className="route-swatch" style={{ background: r.color }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{r.name}</div>
                              <div className="route-sub">
                                {r.cards.length} leg{r.cards.length === 1 ? '' : 's'} · {peso(total)}
                                {loaded.length > 0 && ` · ${fmtDistance(dist)} · ~${fmtDuration(dur)} by road`}
                              </div>
                            </div>
                            {viewingSelf && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button className="btn sm" onClick={() => setModal({ type: 'card', route: r })}>Add card</button>
                                <button className="btn ghost sm" onClick={() => setModal({ type: 'route', route: r })}>Rename</button>
                                <button className="btn danger sm" onClick={() => removeRoute(r)}>Remove</button>
                              </div>
                            )}
                          </div>

                          {r.cards.length === 0 ? (
                            <div className="route-empty">No cards yet.</div>
                          ) : (
                            <div className="cards-grid">
                              {r.cards.map((c, i) => {
                                const leg = legs[c._id];
                                return (
                                  <article key={c._id} className="tcard" style={{ borderTopColor: r.color }}>
                                    <div className="tcard-top">
                                      <span className="tcard-mode">{MODE_ICON[c.mode] || '🧭'} {c.mode}</span>
                                      <span className="tcard-n">#{i + 1}</span>
                                    </div>
                                    <div className="tcard-name">{c.name || '—'}</div>
                                    <div className="tcard-price">{peso(c.price)}</div>
                                    <dl className="tcard-dl">
                                      <dt>From</dt><dd title={c.from.label}>{shortLabel(c.from.label)}</dd>
                                      <dt>To</dt><dd title={c.to.label}>{shortLabel(c.to.label)}</dd>
                                      <dt>Updated</dt><dd>{fmtDate(c.updatedOn)}</dd>
                                      {leg?.coords && (<><dt>Road</dt><dd>{fmtDistance(leg.distance)} · ~{fmtDuration(leg.duration)}</dd></>)}
                                      {leg?.error && (<><dt>Road</dt><dd className="tcard-err">{leg.error}</dd></>)}
                                    </dl>
                                    {viewingSelf && (
                                      <div className="tcard-actions">
                                        <button className="btn ghost sm" onClick={() => setModal({ type: 'card', route: r, card: c })}>Edit</button>
                                        <button className="btn danger sm" onClick={() => removeCard(r, c)}>Remove</button>
                                      </div>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {modal?.type === 'dest' && (
        <DestinationModal initial={modal.dest} onSubmit={saveDestination} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'route' && (
        <RouteNameModal initial={modal.route} onSubmit={saveRoute} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'card' && (
        <CardModal initial={modal.card} defaults={cardDefaults(modal.route)} onSubmit={saveCard} onClose={() => setModal(null)} />
      )}
    </main>
  );
}
