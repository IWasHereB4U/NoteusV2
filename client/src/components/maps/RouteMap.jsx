import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_TILES, OSM_ATTRIBUTION } from '../../utils/osm.js';

// MGOctaviano04Oct2026 — Leaflet map on OpenStreetMap tiles.
//   markers: [{ lat, lng, label, color }]
//   lines:   [{ from:{lat,lng}, to:{lat,lng}, color, label }]
// Circle markers + plain polylines on purpose: Leaflet's default pin icons
// are image files that bundlers break, and this needs no extra assets.
export function RouteMap({ markers = [], lines = [], height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([12.88, 121.77], 5); // Philippines
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const bounds = [];

    lines.forEach((l) => {
      const a = [l.from.lat, l.from.lng];
      const b = [l.to.lat, l.to.lng];
      const line = L.polyline([a, b], { color: l.color || '#0E9C92', weight: 5, opacity: 0.85 });
      if (l.label) line.bindTooltip(l.label, { sticky: true });
      line.addTo(layer.current);
      bounds.push(a, b);
    });

    markers.forEach((m) => {
      const p = [m.lat, m.lng];
      const dot = L.circleMarker(p, {
        radius: 8, color: '#fff', weight: 2, fillColor: m.color || '#0B1615', fillOpacity: 1,
      });
      if (m.label) dot.bindTooltip(m.label, { direction: 'top' });
      dot.addTo(layer.current);
      bounds.push(p);
    });

    if (bounds.length) map.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [markers, lines]);

  return <div ref={el} style={{ height, width: '100%', borderRadius: 'var(--r)', overflow: 'hidden' }} />;
}
