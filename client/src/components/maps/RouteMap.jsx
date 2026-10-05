import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function pin(letter, color) {
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin" style="background:${color}">${letter}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// OpenStreetMap tiles + one polyline per route card (road geometry from
// OSRM, passed in via `legs`), with A/B markers for the destination.
// Cards whose road route hasn't loaded (or failed) fall back to a dashed
// straight line so something is always visible.
export function RouteMap({ from, to, routes, legs, activeId }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

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

  // Draw
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();

    const dim = activeId && routes.length > 1;
    routes.forEach((route) => {
      const active = !activeId || route._id === activeId;
      route.cards.forEach((c) => {
        const leg = legs[c._id];
        const style = {
          color: c.color || route.color,
          weight: active && activeId ? 7 : 5,
          opacity: active ? 0.9 : dim ? 0.25 : 0.9,
        };
        const tip = `${c.mode}${c.name ? ' · ' + c.name : ''}`;
        const line = leg?.coords
          ? L.polyline(leg.coords, style)
          : L.polyline(
              [[c.from.lat, c.from.lon], [c.to.lat, c.to.lon]],
              { ...style, weight: 3, dashArray: '6 8' }
            );
        line.bindTooltip(tip, { sticky: true }).addTo(layer.current);
      });
    });

    if (from) L.marker([from.lat, from.lon], { icon: pin('A', '#0E9C92'), zIndexOffset: 1000 }).bindTooltip(from.label.split(',')[0]).addTo(layer.current);
    if (to) L.marker([to.lat, to.lon], { icon: pin('B', '#F1614B'), zIndexOffset: 1000 }).bindTooltip(to.label.split(',')[0]).addTo(layer.current);
  }, [from, to, routes, legs, activeId]);

  // Fit the view when the destination or loaded geometry changes — not when
  // merely highlighting a different route, which would be jumpy.
  useEffect(() => {
    if (!map.current || !layer.current) return;
    const b = layer.current.getBounds();
    if (b.isValid()) map.current.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
  }, [from, to, legs, routes.length]);

  return <div ref={el} className="route-map" />;
}
