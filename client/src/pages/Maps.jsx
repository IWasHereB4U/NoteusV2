import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal, Modal } from '../components/Modal.jsx';
import { PlaceSearch } from '../components/maps/PlaceSearch.jsx';
import { RouteMap } from '../components/maps/RouteMap.jsx';
import { MODE_COLORS, TRANSPORT_MODES, peso, shortLabel, todayISO } from '../utils/osm.js';

// MGOctaviano04Oct2026 — Maps module.
// Destinations (From -> To) > Routes > Cards (one card per leg/ride:
// mode, transport name, price, date updated, from, to). Places are chosen
// through OpenStreetMap search so every card can be drawn on the map.

const routeTotal = (route) => (route.cards || []).reduce((sum, c) => sum + (Number(c.price) || 0), 0);

// ---------- Destination modal (From / To) ----------
function DestinationModal({ initial, onSubmit, onClose }) {
  const [from, setFrom] = useState(initial?.from || null);
  const [to, setTo] = useState(initial?.to || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
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
      width={600}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" disabled={!from || !to || saving} onClick={submit}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <div className="field-grid">
        <PlaceSearch label="From" value={from} onChange={setFrom} />
        <PlaceSearch label="To" value={to} onChange={setTo} />
      </div>
    </Modal>
  );
}

// ---------- Card modal ----------
function CardModal({ initial, defaults, onSubmit, onClose }) {
  const [mode, setMode] = useState(initial?.mode || 'Jeepney');
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [dateUpdated, setDateUpdated] = useState(initial?.dateUpdated || todayISO());
  const [dateTouched, setDateTouched] = useState(false);
  const [from, setFrom] = useState(initial?.from || defaults.from || null);
  const [to, setTo] = useState(initial?.to || defaults.to || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        mode,
        name: name.trim(),
        price: Number(price) || 0,
        // Saving a card means you just checked it — stamp today unless the
        // date was set by hand.
        dateUpdated: dateTouched ? dateUpdated : todayISO(),
        from,
        to,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial ? 'Edit card' : 'Add card'}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" disabled={!from || !to || saving} onClick={submit}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <div className="field-grid">
        <div className="field-row" style={{ gridColumn: 'span 1' }}>
          <label>Mode of transportation</label>
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
            {TRANSPORT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field-row" style={{ gridColumn: 'span 1' }}>
          <label>Transportation name</label>
          <input className="field" value={name} placeholder="e.g. Antipolo–Cubao, LRT-2" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row" style={{ gridColumn: 'span 1' }}>
          <label>Price (₱)</label>
          <input className="field" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field-row" style={{ gridColumn: 'span 1' }}>
          <label>Date updated</label>
          <input
            className="field"
            type="date"
            value={dateUpdated}
            onChange={(e) => { setDateUpdated(e.target.value); setDateTouched(true); }}
          />
        </div>
        <PlaceSearch label="From" value={from} onChange={setFrom} />
        <PlaceSearch label="To" value={to} onChange={setTo} />
      </div>
    </Modal>
  );
}

// ---------- Page ----------
export function Maps() {
  const { items, reload, viewingId } = useResource('/destinations');
  const { viewingSelf } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const [mapRoute, setMapRoute] = useState('all'); // 'all' | route _id
  const [destModal, setDestModal] = useState(null); // {} for new, destination for edit
  const [routeModal, setRouteModal] = useState(null); // { route? }
  const [cardModal, setCardModal] = useState(null); // { routeId, card?, index? }

  // Keep a valid selection as the list loads / changes / the viewed book switches.
  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return; }
    if (!items.some((d) => d._id === selectedId)) setSelectedId(items[0]._id);
  }, [items, selectedId]);

  const dest = items.find((d) => d._id === selectedId) || null;
  const q = viewingId || undefined;

  // Map layers for the selected destination.
  const { markers, lines } = useMemo(() => {
    if (!dest) return { markers: [], lines: [] };
    const shownRoutes = mapRoute === 'all' ? dest.routes : dest.routes.filter((r) => r._id === mapRoute);
    const ls = [];
    shownRoutes.forEach((r) =>
      (r.cards || []).forEach((c) => {
        if (c.from && c.to) {
          ls.push({
            from: c.from,
            to: c.to,
            color: MODE_COLORS[c.mode] || MODE_COLORS.Other,
            label: `${c.mode}${c.name ? ` · ${c.name}` : ''} — ${peso(c.price)}`,
          });
        }
      })
    );
    return {
      markers: [
        { ...dest.from, label: `From: ${shortLabel(dest.from.label)}`, color: '#0E9C92' },
        { ...dest.to, label: `To: ${shortLabel(dest.to.label)}`, color: '#F1614B' },
      ],
      lines: ls,
    };
  }, [dest, mapRoute]);

  useEffect(() => { setMapRoute('all'); }, [selectedId]);

  // ----- mutations -----
  async function saveDestination(values) {
    if (destModal?._id) {
      await api.put(`/destinations/${destModal._id}`, values, q);
    } else {
      const created = await api.post('/destinations', { ...values, routes: [] }, q);
      setSelectedId(created._id);
    }
    await reload();
  }

  async function removeDestination(d) {
    if (!confirm(`Delete ${shortLabel(d.from.label)} → ${shortLabel(d.to.label)} and all its routes?`)) return;
    await api.del(`/destinations/${d._id}`, q);
    await reload();
  }

  async function saveRoutes(routes) {
    await api.put(`/destinations/${dest._id}`, { routes }, q);
    await reload();
  }

  const cloneRoutes = () => JSON.parse(JSON.stringify(dest.routes));

  async function saveRouteName({ name }) {
    const routes = cloneRoutes();
    if (routeModal?.route) routes.find((r) => r._id === routeModal.route._id).name = name;
    else routes.push({ name, cards: [] });
    await saveRoutes(routes);
  }

  async function removeRoute(route) {
    if (!confirm('Delete this route and its cards?')) return;
    await saveRoutes(cloneRoutes().filter((r) => r._id !== route._id));
  }

  async function saveCard(values) {
    const routes = cloneRoutes();
    const route = routes.find((r) => r._id === cardModal.routeId);
    if (cardModal.card) route.cards[cardModal.index] = { ...route.cards[cardModal.index], ...values };
    else route.cards.push(values);
    await saveRoutes(routes);
  }

  async function removeCard(route, index) {
    if (!confirm('Delete this card?')) return;
    const routes = cloneRoutes();
    routes.find((r) => r._id === route._id).cards.splice(index, 1);
    await saveRoutes(routes);
  }

  // A new card continues where the previous one ended.
  function cardDefaults(route) {
    const last = route.cards?.[route.cards.length - 1];
    return { from: last?.to || dest.from, to: dest.to };
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Travel</div><h1>Maps</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setDestModal({})}>Add destination</button>}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty"><b>No destinations yet</b>Add a From → To, then build routes out of transport cards.</div>
        </div>
      ) : (
        <div className="maps-grid">
          {/* Destinations list */}
          <div className="card" style={{ alignSelf: 'start' }}>
            <div className="card-h"><h2>Destinations</h2></div>
            <div className="stack">
              {items.map((d) => (
                <button
                  key={d._id}
                  type="button"
                  className={`dest-item${d._id === selectedId ? ' on' : ''}`}
                  onClick={() => setSelectedId(d._id)}
                >
                  <span className="dest-from">{shortLabel(d.from.label)}</span>
                  <span className="dest-arrow">→</span>
                  <span className="dest-to">{shortLabel(d.to.label)}</span>
                  <span className="dest-count">{d.routes.length} route{d.routes.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected destination */}
          {dest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div className="card">
                <div className="card-h">
                  <h2>{shortLabel(dest.from.label)} → {shortLabel(dest.to.label)}</h2>
                  {viewingSelf && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn ghost sm" onClick={() => setRouteModal({})}>Add route</button>
                      <button className="btn ghost sm" onClick={() => setDestModal(dest)}>Edit</button>
                      <button className="btn danger sm" onClick={() => removeDestination(dest)}>Delete</button>
                    </div>
                  )}
                </div>
                <div style={{ padding: 14 }}>
                  <div className="route-chips">
                    <button type="button" className={mapRoute === 'all' ? 'on' : ''} onClick={() => setMapRoute('all')}>All routes</button>
                    {dest.routes.map((r, i) => (
                      <button key={r._id} type="button" className={mapRoute === r._id ? 'on' : ''} onClick={() => setMapRoute(r._id)}>
                        {r.name || `Route ${i + 1}`}
                      </button>
                    ))}
                  </div>
                  <RouteMap markers={markers} lines={lines} />
                </div>
              </div>

              {dest.routes.length === 0 && (
                <div className="card">
                  <div className="empty"><b>No routes yet</b>{viewingSelf ? 'Add a route, then add a card for each ride along the way.' : 'Nothing has been added here yet.'}</div>
                </div>
              )}

              {dest.routes.map((route, ri) => (
                <div className="card" key={route._id}>
                  <div className="card-h">
                    <h2>{route.name || `Route ${ri + 1}`} · {peso(routeTotal(route))}</h2>
                    {viewingSelf && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn ghost sm" onClick={() => setCardModal({ routeId: route._id })}>Add card</button>
                        <button className="btn ghost sm" onClick={() => setRouteModal({ route })}>Rename</button>
                        <button className="btn danger sm" onClick={() => removeRoute(route)}>Delete</button>
                      </div>
                    )}
                  </div>
                  {(route.cards || []).length === 0 ? (
                    <div className="empty"><b>No cards</b>Add the first leg of this route.</div>
                  ) : (
                    <div className="transport-cards">
                      {route.cards.map((c, ci) => (
                        <div className="transport-card" key={c._id || ci} style={{ borderTopColor: MODE_COLORS[c.mode] || MODE_COLORS.Other }}>
                          <div className="tc-top">
                            <span className="tag" style={{ background: MODE_COLORS[c.mode] || MODE_COLORS.Other, color: '#fff' }}>{c.mode}</span>
                            <span className="tc-price">{peso(c.price)}</span>
                          </div>
                          <div className="tc-name">{c.name || '—'}</div>
                          <div className="tc-route">
                            <span title={c.from?.label}>{shortLabel(c.from?.label)}</span>
                            <span style={{ color: 'var(--ink3)' }}> → </span>
                            <span title={c.to?.label}>{shortLabel(c.to?.label)}</span>
                          </div>
                          <div className="tc-foot">
                            <span>Updated {c.dateUpdated || '—'}</span>
                            {viewingSelf && (
                              <span style={{ display: 'flex', gap: 6 }}>
                                <button className="btn ghost sm" onClick={() => setCardModal({ routeId: route._id, card: c, index: ci })}>Edit</button>
                                <button className="btn danger sm" onClick={() => removeCard(route, ci)}>×</button>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {destModal && (
        <DestinationModal initial={destModal} onSubmit={saveDestination} onClose={() => setDestModal(null)} />
      )}
      {routeModal && (
        <FormModal
          title={routeModal.route ? 'Rename route' : 'Add route'}
          fields={[{ k: 'name', label: 'Route name', placeholder: 'e.g. Via LRT-2 (cheapest)' }]}
          initial={{ name: routeModal.route?.name || '' }}
          onSubmit={saveRouteName}
          onClose={() => setRouteModal(null)}
        />
      )}
      {cardModal && dest && (
        <CardModal
          initial={cardModal.card}
          defaults={cardDefaults(dest.routes.find((r) => r._id === cardModal.routeId))}
          onSubmit={saveCard}
          onClose={() => setCardModal(null)}
        />
      )}
    </main>
  );
}
