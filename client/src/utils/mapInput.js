// Turns whatever a person pastes into a place box into something usable:
//   "14.5995, 120.9842"                       decimal coordinates
//   "14°35'58.2\"N 120°59'03.1\"E"              degrees / minutes / seconds
//   "14.5995° N, 120.9842° E"                  decimal with N/S/E/W
//   https://www.google.com/maps/place/.../@14.6,121.0,17z/...   map links
//   https://maps.app.goo.gl/xxxx               short links (need the server to expand)
//   geo:14.5995,120.9842                       geo: links
// Pure functions, no network — see api/geo.js for the lookups that use them.

const inRange = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function point(lat, lon, label) {
  const la = Number(lat);
  const lo = Number(lon);
  return inRange(la, lo) ? { kind: 'point', lat: la, lon: lo, ...(label ? { label } : {}) } : null;
}

// --- coordinates ---------------------------------------------------------
function fromHemispheres(s) {
  const suffix = [...s.matchAll(/(\d{1,3}(?:\.\d+)?)\s*°?\s*(?:(\d{1,2}(?:\.\d+)?)\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*"\s*)?\s*([NSEW])\b/gi)];
  const prefix = [...s.matchAll(/\b([NSEW])\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*(?:(\d{1,2}(?:\.\d+)?)\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*"\s*)?/gi)];
  const parts = suffix.length === 2
    ? suffix.map((m) => ({ d: m[1], m: m[2], s: m[3], h: m[4] }))
    : prefix.length === 2
      ? prefix.map((m) => ({ d: m[2], m: m[3], s: m[4], h: m[1] }))
      : null;
  if (!parts) return null;
  let lat = null;
  let lon = null;
  for (const p of parts) {
    const h = p.h.toUpperCase();
    const v = (Number(p.d) + Number(p.m || 0) / 60 + Number(p.s || 0) / 3600) * (h === 'S' || h === 'W' ? -1 : 1);
    if (h === 'N' || h === 'S') lat = v; else lon = v;
  }
  return lat == null || lon == null ? null : point(lat, lon);
}

const DECIMAL_PAIR = /^(?:lat(?:itude)?\s*[:=]?\s*)?(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([,;]|\s)\s*(?:lon(?:g|gitude)?\s*[:=]?\s*)?(-?\d{1,3}(?:\.\d+)?)\s*°?$/i;

export function parseCoordinates(text) {
  const s = String(text ?? '')
    .trim()
    .replace(/[()[\]]/g, ' ')
    .replace(/[′’‘]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (/[NSEW]/i.test(s.replace(/lat(itude)?|lon(g|gitude)?/gi, ''))) {
    const h = fromHemispheres(s);
    if (h) return h;
  }
  const m = s.match(DECIMAL_PAIR);
  if (!m) return null;
  // Two bare integers separated by a space ("7 11") are far more likely a
  // name than a location, so a space-only pair needs decimals.
  const hasDecimals = m[1].includes('.') && m[3].includes('.');
  if (m[2] === ' ' && !hasDecimals) return null;
  return point(m[1], m[3]);
}

// --- links ---------------------------------------------------------------
const PAIR = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;
const pairIn = (v) => {
  const m = v && String(v).match(new RegExp(`^\\s*${PAIR.source}\\s*$`));
  return m ? point(m[1], m[2]) : null;
};
const safeDecode = (v) => {
  try { return decodeURIComponent(String(v).replace(/\+/g, ' ')); } catch { return String(v); }
};
const SHORT_HOST = /(^|\.)(maps\.app\.goo\.gl|goo\.gl|g\.co|share\.google)$/i;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]{2,10}$/i;

function placeNameFromPath(path) {
  const m = path.match(/\/maps\/(?:place|search)\/([^/@]+)/i);
  if (!m) return '';
  const name = safeDecode(m[1]).trim();
  return pairIn(name) ? '' : name;
}

export function parseMapLink(text) {
  const raw = String(text ?? '').trim();
  if (!raw || /\s/.test(raw)) return null;

  // geo:14.5995,120.9842?q=...
  if (/^geo:/i.test(raw)) {
    const p = raw.slice(4).split(/[?;]/)[0];
    return pairIn(p);
  }

  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
  const host = u.hostname.toLowerCase();
  const q = u.searchParams;
  const full = safeDecode(u.pathname + u.search + u.hash);

  if (SHORT_HOST.test(host)) return { kind: 'short', url: u.toString() };

  const isGoogle = GOOGLE_HOST.test(host);
  const isOsm = /(^|\.)(openstreetmap\.org|osm\.org)$/i.test(host);
  const isApple = /(^|\.)maps\.apple\.com$/i.test(host);
  const isBing = /(^|\.)bing\.com$/i.test(host);
  const isWaze = /(^|\.)waze\.com$/i.test(host);
  if (!isGoogle && !isOsm && !isApple && !isBing && !isWaze) return null;
  // A Google *search* URL that happens to carry q=1,2 is not a map link.
  if (isGoogle && !/\/maps/i.test(u.pathname) && !/^maps\./i.test(host)) return null;

  const name = isGoogle ? placeNameFromPath(u.pathname) : '';
  let found = null;

  if (isGoogle) {
    // !3d<lat>!4d<lon> is the pin itself; @lat,lon is only where the view is centred.
    const pin = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (pin) found = point(pin[1], pin[2], name);
    if (!found) {
      for (const k of ['destination', 'q', 'query', 'll', 'center', 'sll', 'cbll', 'daddr']) {
        const p = pairIn(safeDecode(q.get(k) || ''));
        if (p) { found = { ...p, ...(name ? { label: name } : {}) }; break; }
      }
    }
    if (!found) {
      const at = full.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
      if (at) found = point(at[1], at[2], name);
    }
    if (!found) {
      const seg = u.pathname.match(/\/maps\/(?:place|search|dir)\/(-?\d{1,2}(?:\.\d+)?,\s*-?\d{1,3}(?:\.\d+)?)/i);
      if (seg) found = pairIn(safeDecode(seg[1]));
    }
  } else if (isOsm) {
    const mlat = q.get('mlat');
    const mlon = q.get('mlon');
    if (mlat && mlon) found = point(mlat, mlon);
    if (!found && q.get('lat') && q.get('lon')) found = point(q.get('lat'), q.get('lon'));
    if (!found) {
      const h = u.hash.match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
      if (h) found = point(h[1], h[2]);
    }
  } else if (isBing) {
    const cp = (q.get('cp') || '').match(/^(-?\d+(?:\.\d+)?)~(-?\d+(?:\.\d+)?)$/);
    if (cp) found = point(cp[1], cp[2]);
    const sp = (q.get('sp') || '').match(/point\.(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)_?(.*)/);
    if (sp) found = point(sp[1], sp[2], safeDecode(sp[3] || ''));
  } else {
    // Apple Maps and Waze
    for (const k of ['ll', 'coordinate', 'sll', 'q']) {
      const p = pairIn(safeDecode(q.get(k) || ''));
      if (p) { found = p; break; }
    }
  }
  if (found) return found;

  // No coordinates in the link, but it names a place — worth a normal search.
  const text2 = name || (q.get('q') || q.get('query') || '').trim();
  return text2 ? { kind: 'search', query: text2 } : null;
}

// Anything pasted into a place box. Returns
//   { kind: 'point', lat, lon, label? } | { kind: 'short', url } | { kind: 'search', query } | null
export function parseMapInput(text) {
  const coords = parseCoordinates(text);
  if (coords) return coords;
  return parseMapLink(text);
}

// --- going the other way: links and text for a stored place ----------------
const fixed = (n) => Number(n).toFixed(6);

export const fmtCoords = (p) => `${fixed(p.lat)}, ${fixed(p.lon)}`;
export const googleMapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${fixed(p.lat)},${fixed(p.lon)}`;
export const osmUrl = (p, zoom = 17) => `https://www.openstreetmap.org/?mlat=${fixed(p.lat)}&mlon=${fixed(p.lon)}#map=${zoom}/${fixed(p.lat)}/${fixed(p.lon)}`;

// Turn-by-turn in Google Maps. `mode` is driving | transit | walking | bicycling.
export function googleDirectionsUrl(from, to, mode = 'transit') {
  return `https://www.google.com/maps/dir/?api=1&origin=${fixed(from.lat)},${fixed(from.lon)}&destination=${fixed(to.lat)},${fixed(to.lon)}&travelmode=${mode}`;
}
