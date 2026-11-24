import { useEffect, useRef, useState } from 'react';
import { searchPlaces, resolvePlaceInput } from '../../api/geo.js';
import { fmtCoords, googleMapsUrl } from '../../utils/mapInput.js';
import { MapPickerModal } from './MapPickerModal.jsx';

// Pick a place by searching OpenStreetMap (Nominatim). `value` is
// {label, lat, lon} or null. Search runs on Enter / the Search button —
// not on every keystroke — to stay within Nominatim's 1 req/sec policy.
export function PlaceField({ value, onChange, placeholder = 'Search a place, or paste coordinates / a map link…' }) {
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

  // `input` is passed when the text was just pasted (state hasn't updated yet).
  async function run(input = text) {
    const query = String(input).trim();
    if (!query) return;
    abort.current?.abort();
    abort.current = new AbortController();
    const { signal } = abort.current;
    setBusy(true);
    setError('');
    try {
      // Coordinates and map links (Google Maps etc.) are used directly;
      // anything else is a normal place search.
      const direct = await resolvePlaceInput(query, signal);
      if (direct?.kind === 'place') {
        pick(direct.place);
        return;
      }
      const term = direct?.kind === 'search' ? direct.query : query;
      if (direct?.kind === 'search') setText(term);
      setResults(await searchPlaces(term, signal));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  // Pasting a map link or coordinates picks the spot straight away.
  function onPaste(e) {
    const pasted = e.clipboardData?.getData('text') || '';
    if (!pasted.trim() || !/^(\s*[-+\d(]|\s*lat|\s*[NSEW]\s*\d|\s*geo:|\s*(https?:\/\/|[\w-]+\.[\w.-]+\/))/i.test(pasted)) return;
    e.preventDefault();
    setText(pasted.trim());
    if (value) onChange(null);
    run(pasted);
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
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn ghost sm" onClick={() => run()} disabled={busy || !text.trim()}>
          {busy ? '…' : 'Search'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setPicking(true)} title="Can't find it? Drop a pin on the map">
          📍 Map
        </button>
      </div>
      {value && (
        <div className="place-ok">
          ✓ {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
          {' · '}
          <a href={googleMapsUrl(value)} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
          {' · '}
          <button type="button" className="linkish" onClick={() => navigator.clipboard?.writeText(fmtCoords(value))} title="Copy the coordinates">Copy coordinates</button>
        </div>
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
