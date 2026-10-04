// Thin wrappers around the two public OpenStreetMap-ecosystem services the
// Maps module uses:
//   - Nominatim  (search/geocoding)  https://nominatim.org/release-docs/latest/api/Search/
//   - OSRM       (road routing)      https://project-osrm.org/docs/v5.24.0/api/#route-service
// Both are called straight from the browser (they send CORS headers).
//
// The public servers are fair-use only (Nominatim: max 1 request/second, no
// bulk/autocomplete-as-you-type). To lift that, self-host and point these at
// your own instance via client/.env:
//   VITE_NOMINATIM_URL=https://nominatim.example.com
//   VITE_OSRM_URL=https://osrm.example.com
//   VITE_NOMINATIM_COUNTRY=ph      (optional — comma-separated ISO codes)
const NOMINATIM = (import.meta.env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const OSRM = (import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const COUNTRY = import.meta.env.VITE_NOMINATIM_COUNTRY || '';

export async function searchPlaces(query, signal) {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(NOMINATIM + '/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '6');
  url.searchParams.set('addressdetails', '0');
  if (COUNTRY) url.searchParams.set('countrycodes', COUNTRY);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Place search failed');
  const rows = await res.json();
  return rows.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

// Short name for list headings: "Cubao, Quezon City, Metro Manila, ..." -> "Cubao".
export function shortLabel(label = '') {
  return label.split(',')[0].trim() || label;
}

const routeCache = new Map();

// Road route between two points. Returns
//   { coords: [[lat, lon], ...], distance (m), duration (s) }
// The public OSRM demo server only has the car profile, so this is the
// driving path/ETA — a good approximation of the road a jeep/bus/UV takes,
// but not of rail, ferry, or walking shortcuts.
export async function osrmRoute(a, b, signal) {
  const key = `${a.lon},${a.lat};${b.lon},${b.lat}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const url = `${OSRM}/route/v1/driving/${key}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Routing failed');
  const data = await res.json();
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r) throw new Error('No route found');

  const out = {
    coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distance: r.distance,
    duration: r.duration,
  };
  routeCache.set(key, out);
  return out;
}

export function fmtDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function fmtDuration(s) {
  if (s == null) return '';
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
