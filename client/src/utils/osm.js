// MGOctaviano04Oct2026 — OpenStreetMap helpers for the Maps module.
// Geocoding goes through OSM's public Nominatim API straight from the
// browser (it sends CORS headers). Their usage policy allows ~1 request per
// second and forbids search-as-you-type, so lookups only fire on an explicit
// Search click / Enter, never on every keystroke.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export async function searchPlaces(query, { limit = 6 } = {}) {
  const q = query.trim();
  if (!q) return [];
  const url = `${NOMINATIM}?${new URLSearchParams({ q, format: 'jsonv2', limit: String(limit) })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('OpenStreetMap search failed — try again in a moment');
  const data = await res.json();
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}

// Tile layer used by the map. Attribution is required by OSM's tile policy.
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Colour per transport mode — used for card badges and map lines.
export const MODE_COLORS = {
  Walk: '#7C8B89',
  Jeepney: '#DB9A2F',
  Bus: '#5B6EE1',
  'UV Express': '#0E9C92',
  Tricycle: '#C77D1A',
  Train: '#8E44AD',
  Ferry: '#2E86C1',
  'Taxi / Ride-hailing': '#1F9D6B',
  Motorcycle: '#E67E22',
  Car: '#34495E',
  Plane: '#16A085',
  Other: '#7C8B89',
};

export const TRANSPORT_MODES = Object.keys(MODE_COLORS);

export function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Short form of Nominatim's very long display_name: "Cubao, Quezon City, ..." -> "Cubao"
export const shortLabel = (label) => (label || '').split(',')[0].trim() || label || '';
