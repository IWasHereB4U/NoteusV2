import { useEffect, useRef, useState } from 'react';
import { searchPlaces, parseCoords } from '../../api/geo.js';
import { MapPickerModal } from './MapPickerModal.jsx';

// Pick a place by searching OpenStreetMap (Nominatim). `value` is
// {label, lat, lon} or null. Search runs on Enter / the Search button —
// not on every keystroke — to stay within Nominatim's 1 req/sec policy.
export function PlaceField({ value, onChange, placeholder = 'Search a place…' }) {
  const [text, setText] = useState(value?.label || '');
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const abort = useRef(null);

  // Keep the input in step when the parent swaps the value (e.g. the next
  // card's "From" defaults to the previous card's "To").
  useEffect(() => {
    setText(value?.label || '');
  }, [value?.label]);

  useEffect(() => () => abort.current?.abort(), []);

  async function run() {
    if (!text.trim()) return;
    // Typed coordinates ("14.5995, 120.9842") are used as-is.
    const c = parseCoords(text);
    if (c) {
      pick({ label: `Pinned location (${c.lat}, ${c.lon})`, ...c });
      return;
    }
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      setResults(await searchPlaces(text, abort.current.signal));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  function pick(p) {
    onChange(p);
    setText(p.label);
    setResults(null);
  }

  return (
    <div className="place-field">
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="field"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null); // typing again invalidates the pick
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn ghost sm" onClick={run} disabled={busy || !text.trim()}>
          {busy ? '…' : 'Search'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setPicking(true)} title="Can't find it? Drop a pin on the map">
          📍 Map
        </button>
      </div>
      {value && (
        <div className="place-ok">✓ {value.lat.toFixed(4)}, {value.lon.toFixed(4)}</div>
      )}
      {error && <div className="place-err">{error}</div>}
      {results && (
        <div className="place-results">
          {results.length === 0 ? (
            <div className="place-none">
              No matches — try a more specific name, or{' '}
              <button type="button" className="linkish" onClick={() => setPicking(true)}>pick it on the map</button>.
            </div>
          ) : (
            results.map((r, i) => (
              <button type="button" key={i} onClick={() => pick(r)}>
                {r.label}
              </button>
            ))
          )}
        </div>
      )}
      {picking && (
        <MapPickerModal
          initial={value}
          onClose={() => setPicking(false)}
          onPick={(p) => { setPicking(false); pick(p); }}
        />
      )}
    </div>
  );
}
