import { useState } from 'react';
import { searchPlaces } from '../../utils/osm.js';

// MGOctaviano04Oct2026 — pick a place via OpenStreetMap (Nominatim).
// `value` is { label, lat, lng } | null; onChange gets the same shape.
export function PlaceSearch({ label, value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const found = await searchPlaces(query);
      setResults(found);
      if (found.length === 0) setError('No places found — try a more specific name.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-row" style={{ gridColumn: 'span 2' }}>
      <label>{label}</label>
      {value && (
        <div className="place-picked">
          <span title={value.label}>📍 {value.label}</span>
          <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Change</button>
        </div>
      )}
      {!value && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 0 }}
              value={query}
              placeholder="Search a place on OpenStreetMap…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); search(); }
              }}
            />
            <button type="button" className="btn ghost" onClick={search} disabled={busy}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--coral)', marginTop: 6 }}>{error}</div>}
          {results.length > 0 && (
            <div className="place-results">
              {results.map((r, i) => (
                <button
                  key={`${r.lat},${r.lng},${i}`}
                  type="button"
                  onClick={() => { onChange(r); setResults([]); setQuery(''); }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
