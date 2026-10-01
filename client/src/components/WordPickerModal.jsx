import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Modal } from './Modal.jsx';

function tint(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}26` : 'var(--line)';
}

// Builds a task title out of Note Tag words. Words are shown grouped by
// tag (so with tags like "Client" and "Task" you pick one from each
// group) and can be narrowed by tag chips and a search. Clicking a word
// appends it to the title box at the top, which stays a normal text field
// you can edit by hand. Rendered in a portal so it can open from inside
// another form without submitting it.
// Optional props let other pages reuse it: `titleLabel` renames the title
// box, and `onWordsPicked` (Meetings) receives the ids of the clicked words
// that are still in the title on apply, so they can also become tags.
export function WordPickerModal({ currentTitle = '', onApply, onClose, titleLabel = 'Task title', onWordsPicked }) {
  const [words, setWords] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState([]); // empty = show every tag group
  const [title, setTitle] = useState(currentTitle);
  const titleRef = useRef(null);
  const [picked, setPicked] = useState([]); // word ids clicked, in order
  const [alsoTag, setAlsoTag] = useState(true);

  // Loaded when the picker opens rather than polled with the page — this
  // is the only place the Timesheet needs Note Tag data.
  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/tag-words'), api.get('/note-tags')])
      .then(([w, t]) => {
        if (!alive) return;
        setWords(w);
        setTags([...t].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
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

  function toggleTag(id) {
    setActiveTags((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  // Appends with a single space unless the title is empty or already ends
  // in whitespace. Focus is left where it is (so you can keep clicking
  // words or searching); the box just scrolls to show the end.
  function append(w) {
    const word = w.word;
    setPicked((p) => (p.includes(w._id) ? p : [...p, w._id]));
    setTitle((t) => (!t || /\s$/.test(t) ? t + word : `${t} ${word}`));
    requestAnimationFrame(() => {
      const el = titleRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    });
  }

  function apply() {
    const finalTitle = title.trim();
    onApply(finalTitle);
    if (onWordsPicked && alsoTag) {
      // Only words that survived any hand edits to the title.
      const lower = finalTitle.toLowerCase();
      const ids = picked.filter((id) => {
        const w = words.find((x) => x._id === id);
        return w && lower.includes(w.word.toLowerCase());
      });
      if (ids.length) onWordsPicked(ids);
    }
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
          <button type="button" className="btn" disabled={!title.trim()} onClick={apply}>Use as title</button>
        </>
      }
    >
      <div className="field-row" style={{ marginBottom: 0 }}>
        <label htmlFor="word-picker-title">{titleLabel}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="word-picker-title"
            ref={titleRef}
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Click words below, or type"
            autoFocus
            onKeyDown={(e) => {
              // Enter applies — and must not bubble through the portal
              // into the task form underneath.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (title.trim()) apply();
              }
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="button" className="btn ghost sm" onClick={() => setTitle('')} disabled={!title}>
            Clear
          </button>
        </div>
        {onWordsPicked && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', marginTop: 8, fontWeight: 500 }}>
            <input type="checkbox" checked={alsoTag} onChange={(e) => setAlsoTag(e.target.checked)} />
            Also add the words I click as this meeting's tags
          </label>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0 10px', flexWrap: 'wrap' }}>
        <input
          className="field sm"
          placeholder="Search words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
          style={{ width: 180 }}
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
                      onClick={() => append(w)}
                      title={`Append “${w.word}”`}
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
