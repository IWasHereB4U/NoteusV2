import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export function tint(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}26` : 'var(--line)';
}

const NEUTRAL = '#8A8F8E';
const byName = (a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' });

// A word's color is the color of its first Note Tag (tags in A–Z order),
// so a "Client" word looks like a Client everywhere on the Meetings page.
export function wordColor(word, tagById, sortedTags) {
  if (!word) return NEUTRAL;
  const own = new Set(word.tags || []);
  const first = sortedTags.find((t) => own.has(t._id));
  return first?.color || NEUTRAL;
}

export function WordChip({ word, color, onRemove, small }) {
  return (
    <span
      className="tag-chip"
      style={{
        background: tint(color), color,
        ...(small ? { fontSize: 11, padding: '2px 8px' } : null),
      }}
    >
      <span className="dot" style={{ background: color }} />
      {word?.word || 'Deleted word'}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${word?.word || 'word'}`}
          style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// Picks which Note Tag words a meeting carries as its tags. Words are
// grouped by their Note Tag (a word with two tags shows in both groups),
// can be narrowed by tag chips and a search, and clicking a word toggles
// it on/off. If a search has no exact match, it can be added as a new
// (untagged) word straight from here.
export function MeetingWordPicker({ words, tags, value, onChange, onCreateWord }) {
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t._id, t])), [tags]);
  const wordById = useMemo(() => Object.fromEntries(words.map((w) => [w._id, w])), [words]);
  const selected = new Set(value);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (w) => !q || w.word.toLowerCase().includes(q);
    const wanted = activeTags.length ? tags.filter((t) => activeTags.includes(t._id)) : tags;
    const out = wanted.map((t) => ({
      key: t._id,
      tag: t,
      words: words.filter((w) => (w.tags || []).includes(t._id) && match(w)).sort(byName),
    }));
    if (!activeTags.length) {
      const untagged = words.filter((w) => !(w.tags || []).some((id) => tagById[id]) && match(w)).sort(byName);
      if (untagged.length) out.push({ key: '__none', tag: null, words: untagged });
    }
    return out.filter((g) => g.words.length > 0);
  }, [words, tags, tagById, query, activeTags]);

  const trimmed = query.trim();
  const exact = trimmed && words.find((w) => w.word.trim().toLowerCase() === trimmed.toLowerCase());

  function toggle(id) {
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  async function create() {
    if (!trimmed || exact || !onCreateWord) return;
    setCreating(true);
    setCreateError('');
    try {
      const w = await onCreateWord(trimmed);
      if (w?._id) onChange([...value, w._id]);
      setQuery('');
    } catch (err) {
      setCreateError(err.message || 'Could not add the word');
    } finally {
      setCreating(false);
    }
  }

  function onSearchKey(e) {
    if (e.key !== 'Enter') return;
    // Never submit the meeting form from the search box.
    e.preventDefault();
    e.stopPropagation();
    if (exact) toggle(exact._id);
    else create();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* What this meeting is tagged with */}
      <div className="chip-wrap" style={{ minHeight: 24, alignItems: 'center' }}>
        {value.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No tags yet — click words below.</span>
        ) : (
          value.map((id) => (
            <WordChip
              key={id}
              word={wordById[id]}
              color={wordColor(wordById[id], tagById, tags)}
              onRemove={() => toggle(id)}
            />
          ))
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="field sm"
          placeholder={onCreateWord ? 'Search or add a word…' : 'Search words…'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCreateError(''); }}
          onKeyDown={onSearchKey}
          style={{ width: 200 }}
        />
        {tags.map((t) => {
          const on = activeTags.includes(t._id);
          return (
            <button
              key={t._id}
              type="button"
              className="tag-chip pick"
              aria-pressed={on}
              onClick={() => setActiveTags((a) => (on ? a.filter((x) => x !== t._id) : [...a, t._id]))}
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

      {trimmed && !exact && onCreateWord && (
        <div>
          <button type="button" className="tag-chip pick" style={{ borderStyle: 'dashed' }} onClick={create} disabled={creating}>
            {creating ? 'Adding…' : `+ Add “${trimmed}” as a new word`}
          </button>
          {createError && <div className="auth-error" style={{ marginTop: 8, marginBottom: 0 }}>{createError}</div>}
        </div>
      )}

      {words.length === 0 ? (
        <div className="empty" style={{ padding: 14 }}>
          <b>No Note Tag words yet</b>
          {onCreateWord ? 'Type a word above to add it, or set words up on the ' : 'Add words on the '}
          <Link to="/note-tags">Note Tag</Link> page.
        </div>
      ) : groups.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No words match{trimmed ? ` “${trimmed}”` : ''}.</div>
      ) : (
        <div className="word-groups" style={{ maxHeight: '30vh' }}>
          {groups.map((g) => (
            <div key={g.key} className="word-group">
              <div className="word-group-h" style={{ color: g.tag?.color || 'var(--ink3)' }}>
                <span className="dot" style={{ background: g.tag?.color || 'var(--ink3)' }} />
                {g.tag ? g.tag.name : 'Untagged'}
                <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>{g.words.length}</span>
              </div>
              <div className="chip-wrap">
                {g.words.map((w) => {
                  const on = selected.has(w._id);
                  const c = g.tag?.color || NEUTRAL;
                  return (
                    <button
                      key={w._id}
                      type="button"
                      className="tag-chip pick"
                      aria-pressed={on}
                      onClick={() => toggle(w._id)}
                      style={on ? { background: tint(c), color: c, borderColor: 'transparent' } : undefined}
                    >
                      {on && '✓ '}{w.word}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
