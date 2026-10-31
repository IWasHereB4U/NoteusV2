import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mediaUrl } from '../../api/client.js';
import { describeSchedule, scheduleStatus } from '../../utils/poiSchedule.js';

const DEFAULT_COLOR = '#0E9C92';

// Pin = round badge (photo if the POI has one, otherwise a flag glyph on the
// tag's color) with a small tail pointing at the spot. Built from DOM nodes
// rather than an HTML string so user-entered text/URLs can never inject markup.
function pinEl(imageUrl, color) {
  const pin = document.createElement('div');
  pin.className = 'poi-pin';
  pin.style.setProperty('--pin', color);
  const face = document.createElement('div');
  face.className = 'poi-pin-face';
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = mediaUrl(imageUrl);
    img.alt = '';
    img.draggable = false;
    face.appendChild(img);
  } else {
    face.textContent = '⚑';
  }
  pin.appendChild(face);
  return pin;
}

function popupEl(poi) {
  const root = document.createElement('div');
  root.className = 'poi-popup';
  if (poi.imageUrl) {
    const img = document.createElement('img');
    img.src = mediaUrl(poi.imageUrl);
    img.alt = '';
    root.appendChild(img);
  }
  const h = document.createElement('div');
  h.className = 'poi-popup-name';
  h.textContent = poi.name;
  root.appendChild(h);
  if (poi.description) {
    const d = document.createElement('div');
    d.className = 'poi-popup-desc';
    d.textContent = poi.description.length > 160 ? `${poi.description.slice(0, 160)}…` : poi.description;
    root.appendChild(d);
  }
  const when = describeSchedule(poi.schedule);
  if (when) {
    const w = document.createElement('div');
    w.className = 'poi-popup-when';
    const st = scheduleStatus(poi.schedule);
    w.textContent = st ? `${st.label} · ${when}` : when;
    root.appendChild(w);
  }
  return root;
}

// OpenStreetMap tiles with one pin per point of interest. `colorOf(poi)`
// picks the pin color (its first tag). Clicking a pin calls onSelect(id).
export function PoiMap({ pois, colorOf, selectedId, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const markers = useRef(new Map());
  const latest = useRef({ pois, colorOf, onSelect });
  latest.current = { pois, colorOf, onSelect };

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: true }).setView([14.6, 121.0], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.featureGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Redraw only when something a pin shows actually changed — the page
  // re-fetches on a timer, and handing Leaflet fresh-but-identical arrays
  // would otherwise close an open popup every time.
  const sig = pois
    .map((p) => `${p._id}:${p.updatedAt}:${colorOf(p)}`)
    .join('|');

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    markers.current = new Map();
    latest.current.pois.forEach((poi) => {
      const icon = L.divIcon({
        className: 'poi-pin-wrap',
        html: pinEl(poi.imageUrl, latest.current.colorOf(poi) || DEFAULT_COLOR),
        iconSize: [44, 54],
        iconAnchor: [22, 54],
        popupAnchor: [0, -50],
      });
      const m = L.marker([poi.place.lat, poi.place.lon], { icon, title: poi.name })
        .bindPopup(popupEl(poi), { maxWidth: 260, autoPanPadding: [30, 30] })
        .on('click', () => latest.current.onSelect(poi._id))
        .addTo(layer.current);
      markers.current.set(poi._id, m);
    });
    const b = layer.current.getBounds();
    if (b.isValid()) map.current.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
  }, [sig]);

  // Selecting a POI from the list centres on its pin and opens its popup.
  useEffect(() => {
    const m = markers.current.get(selectedId);
    if (!m || !map.current) return;
    map.current.flyTo(m.getLatLng(), Math.max(map.current.getZoom(), 15), { duration: 0.6 });
    m.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={el} className="poi-map" />;
}
