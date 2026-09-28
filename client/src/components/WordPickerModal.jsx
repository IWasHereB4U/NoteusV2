import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Modal } from './Modal.jsx';

const SEPARATORS = [
  [' ', 'Space'],
  [' - ', 'Dash  ( - )'],
  [' | ', 'Bar  ( | )'],
  [' / ', 'Slash  ( / )'],
  [', ', 'Comma  ( , )'],
  [': ', 'Colon  ( : )'],
];

function tint(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}26` : 'var(--line)';
}

// Remembers the last "Join with" choice for the rest of the session.
let lastSeparator = ' ';

let pieceSeq = 0;
const piece = (text, color) => ({ key: `p${++pieceSeq}`, text, color });

// Builds a title out of Note Tag words. Words are shown grouped by tag
// (so with tags like "Client" and "Task" you pick one from each group),
// can be narrowed by tag chips and a search, and every click adds the
// word to the title being built at the top. Rendered in a portal so it
// can open from inside another form without submitting it.
export function WordPickerModal({ currentTitle = '', onApply, onClose }) {
  const [words, setWords] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState([]); // empty = show every tag group
  const [picked, setPicked] = useState([]);
  const [separator, setSeparatorState] = useState(lastSeparator);
  const setSeparator = (v) => { lastSeparator = v; setSeparatorState(v); };
  const [custom, setCustom] = useState('');

  // Loaded when the picker opens rather than polled with the page — this
  // is the only place the Timesheet needs Note Tag data.
  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/tag-words'), api.get('/note-tags')])
      .then(([w, t]) => {
        if (!alive) return;
        setWords(w);
        setTags(t);
      })
      .catch((err) => alive && setLoadError(err.message || 'Could not load Note Tag words'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t._id, t])), [tags]);

  // One group per tag (in tag-name order), plus "Untagged" at the end. A
  // word with two tags appears in both groups — that's what makes
  // mix-and-match work when, say, a name is both a Client and a Contact.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (w) => !q || w.word.toLowerCase().includes(q);
    const byName = (a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' });
    const wanted = activeTags.length ? tags.filter((t) => activeTags.includes(t._id)) : tags;
    const out = wanted.map((t) => ({
      key: t._id,
      tag: t,
      words: words.filter((w) => (w.tags || []).includes(t._id) && match(w)).sort(byName),
    }));
    if (!activeTags.length) {
      const untagged = words
        .filter((w) => !(w.tags || []).some((id) => tagById[id]) && match(w))
        .sort(byName);
      if (untagged.length) out.push({ key: '__none', tag: null, words: untagged });
    }
    return out.filter((g) => g.words.length > 0 || activeTags.includes(g.key));
  }, [words, tags, tagById, query, activeTags]);

  const preview = picked.map((p) => p.text).join(separator);
  const appended = currentTitle.trim() ? `${currentTitle.trim()}${separator}${preview}` : preview;

  function toggleTag(id) {
    setActiveTags((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  function add(text, color) {
    setPicked((p) => [...p, piece(text, color)]);
  }

  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    add(t, null);
    setCustom('');
  }

  function move(i, dir) {
    setPicked((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function apply(title) {
    onApply(title);
    onClose();
  }

  const modal = (
    <Modal
      title="Build title from Note Tag words"
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn ghost"
            disabled={!picked.length || !currentTitle.trim()}
            onClick={() => apply(appended)}
            title={currentTitle.trim() ? `Result: ${appended}` : 'The title is empty — use "Use as title" instead'}
          >
            Append to title
          </button>
          <button type="button" className="btn" disabled={!picked.length} onClick={() => apply(preview)}>
            Use as title
          </button>
        </>
      }
    >
      {/* The title being built */}
      <div className="word-builder">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Title</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
            Join with
            <select className="field sm" value={separator} onChange={(e) => setSeparator(e.target.value)} style={{ width: 'auto' }}>
              {SEPARATORS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {picked.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Click words below to add them here, in order.</div>
        ) : (
          <div className="chip-wrap" style={{ alignItems: 'center' }}>
            {picked.map((p, i) => (
              <span
                key={p.key}
                className="tag-chip"
                style={{ background: p.color ? tint(p.color) : 'var(--line)', color: p.color || 'var(--ink)', paddingRight: 4 }}
              >
                {i > 0 && (
                  <button type="button" className="chip-mini" onClick={() => move(i, -1)} title="Move left" aria-label="Move left">‹</button>
                )}
                {p.text}
                {i < picked.length - 1 && (
                  <button type="button" className="chip-mini" onClick={() => move(i, 1)} title="Move right" aria-label="Move right">›</button>
                )}
                <button
                  type="button"
                  className="chip-mini"
                  onClick={() => setPicked((all) => all.filter((x) => x.key !== p.key))}
                  title="Remove"
                  aria-label={`Remove ${p.text}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => setPicked([])}>Clear</button>
          </div>
        )}

        {/* Not a <form>: React events bubble through the portal, so a
            submit here would also submit the task form underneath. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input
            className="field sm"
            placeholder="Add your own text (e.g. a ticket number)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addCustom();
              }
            }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn ghost sm" onClick={addCustom} disabled={!custom.trim()}>+ Add</button>
        </div>

        {picked.length > 0 && (
          <div className="word-preview" title="Preview">
            {preview}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0 10px', flexWrap: 'wrap' }}>
        <input
          className="field sm"
          placeholder="Search words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 180 }}
          autoFocus
        />
        {tags.map((t) => {
          const on = activeTags.includes(t._id);
          return (
            <button
              key={t._id}
              type="button"
              className="tag-chip pick"
              aria-pressed={on}
              onClick={() => toggleTag(t._id)}
              style={on ? { background: tint(t.color), color: t.color, borderColor: 'transparent' } : undefined}
            >
              <span className="dot" style={{ background: t.color }} />
              {t.name}
            </button>
          );
        })}
        {activeTags.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => setActiveTags([])}>Show all</button>
        )}
      </div>

      {/* Word groups */}
      {loading ? (
        <div className="empty">Loading words…</div>
      ) : loadError ? (
        <div className="auth-error">{loadError}</div>
      ) : words.length === 0 ? (
        <div className="empty">
          <b>No Note Tag words yet</b>
          Add words and tags on the <Link to="/note-tags" onClick={onClose}>Note Tag</Link> page, then come back here.
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">No words match “{query}”.</div>
      ) : (
        <div className="word-groups">
          {groups.map((g) => (
            <div key={g.key} className="word-group">
              <div className="word-group-h" style={{ color: g.tag?.color || 'var(--ink3)' }}>
                <span className="dot" style={{ background: g.tag?.color || 'var(--ink3)' }} />
                {g.tag ? g.tag.name : 'Untagged'}
                <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>{g.words.length}</span>
              </div>
              {g.words.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No matching words</div>
              ) : (
                <div className="chip-wrap">
                  {g.words.map((w) => (
                    <button
                      key={w._id}
                      type="button"
                      className="tag-chip pick"
                      onClick={() => add(w.word, g.tag?.color)}
                      title={`Add “${w.word}”`}
                    >
                      {w.word}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );

  return createPortal(modal, document.body);
}
