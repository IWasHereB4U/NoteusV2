import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Modal } from '../Modal.jsx';
import { searchPlaces, reversePlace } from '../../api/geo.js';

const DEFAULT_CENTER = [14.6, 121.0];

function pinIcon() {
  const pin = document.createElement('div');
  pin.className = 'poi-pin';
  pin.style.setProperty('--pin', '#F1614B');
  const face = document.createElement('div');
  face.className = 'poi-pin-face';
  face.textContent = '●';
  pin.appendChild(face);
  return L.divIcon({ className: 'poi-pin-wrap', html: pin, iconSize: [44, 54], iconAnchor: [22, 54] });
}

const coordLabel = (lat, lon) => `Pinned location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;

// Pick a spot by clicking the map (drag the pin to fine-tune), for places
// the search box can't find — shops, stalls, new buildings. Calls
// onPick({label, lat, lon}). The label is looked up from the pin but stays
// editable, so you can type the real name of the place.
export function MapPickerModal({ initial, onPick, onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const revAbort = useRef(null);
  const labelEdited = useRef(!!initial);

  const [point, setPoint] = useState(initial ? { lat: initial.lat, lon: initial.lon } : null);
  const [label, setLabel] = useState(initial?.label || '');
  const [lookingUp, setLookingUp] = useState(false);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  async function place(lat, lon, { keepZoom = true } = {}) {
    setPoint({ lat, lon });
    setError('');
    if (!marker.current) {
      marker.current = L.marker([lat, lon], { icon: pinIcon(), draggable: true }).addTo(map.current);
      marker.current.on('dragend', () => {
        const ll = marker.current.getLatLng();
        place(ll.lat, ll.lng);
      });
    } else {
      marker.current.setLatLng([lat, lon]);
    }
    if (!keepZoom) map.current.setView([lat, lon], Math.max(map.current.getZoom(), 16));

    // Fill the label from the address unless the user has typed their own.
    if (labelEdited.current) return;
    setLabel(coordLabel(lat, lon));
    revAbort.current?.abort();
    revAbort.current = new AbortController();
    setLookingUp(true);
    try {
      const found = await reversePlace(lat, lon, revAbort.current.signal);
      if (found && !labelEdited.current) setLabel(found);
    } catch {
      /* keep the coordinate label */
    } finally {
      setLookingUp(false);
    }
  }

  useEffect(() => {
    const start = initial ? [initial.lat, initial.lon] : DEFAULT_CENTER;
    map.current = L.map(el.current, { scrollWheelZoom: true }).setView(start, initial ? 16 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    map.current.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    if (initial) place(initial.lat, initial.lon);
    return () => {
      revAbort.current?.abort();
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    if (!q.trim()) return;
    setSearching(true);
    setError('');
    try {
      setResults(await searchPlaces(q));
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function jumpTo(r) {
    setResults(null);
    map.current.setView([r.lat, r.lon], 16);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Your browser can\'t share its location.');
    navigator.geolocation.getCurrentPosition(
      (pos) => map.current && map.current.setView([pos.coords.latitude, pos.coords.longitude], 17),
      () => setError('Couldn\'t get your location — allow location access, or search instead.'),
      { timeout: 10000 }
    );
  }

  function confirm() {
    if (!point) return setError('Click the map to drop a pin first.');
    onPick({ label: label.trim() || coordLabel(point.lat, point.lon), lat: point.lat, lon: point.lon });
  }

  return createPortal(
    <Modal
      title="Pick a place on the map"
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" onClick={confirm} disabled={!point}>Use this location</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          className="field"
          placeholder="Search to jump the map nearby (optional)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn ghost sm" onClick={runSearch} disabled={searching || !q.trim()}>{searching ? '…' : 'Go'}</button>
        <button type="button" className="btn ghost sm" onClick={useMyLocation} title="Center on where you are">My location</button>
      </div>
      {results && (
        <div className="place-results" style={{ marginBottom: 8 }}>
          {results.length === 0 ? <div className="place-none">No matches — pan the map and click instead.</div>
            : results.map((r, i) => <button type="button" key={i} onClick={() => jumpTo(r)}>{r.label}</button>)}
        </div>
      )}
      <div ref={el} className="picker-map" />
      <div className="map-note" style={{ padding: '6px 0' }}>
        Click the map to drop a pin, or drag the pin to adjust it.
        {point && <> · <span className="place-ok" style={{ marginTop: 0 }}>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</span></>}
      </div>
      <div className="field-row" style={{ marginBottom: 0 }}>
        <label>Place name / address {lookingUp && <span className="opt">looking up address…</span>}</label>
        <input
          className="field"
          value={label}
          placeholder="Click the map first, then edit this if you like"
          onChange={(e) => { labelEdited.current = true; setLabel(e.target.value); }}
        />
      </div>
    </Modal>,
    document.body
  );
}
