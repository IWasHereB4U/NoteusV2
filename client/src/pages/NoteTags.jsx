import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';

const TAG_COLORS = ['#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5', '#1F9D6B', '#C0392B', '#8A8F8E'];

// Soft background for a colored chip: the tag color at ~15% opacity.
function tint(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}26` : 'var(--line)';
}

function TagChip({ tag, selected, onClick, small }) {
  const color = tag?.color || '#8A8F8E';
  const style = selected || !onClick
    ? { background: tint(color), color, borderColor: 'transparent' }
    : undefined;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`tag-chip ${onClick ? 'pick' : ''}`}
      style={{ ...style, ...(small ? { fontSize: 11, padding: '2px 8px' } : null) }}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
    >
      <span className="dot" style={{ background: color }} />
      {tag?.name || 'Unknown tag'}
    </Tag>
  );
}

// Toggleable row of every tag, for picking which ones a word carries.
function TagPicker({ tags, value, onChange, onManage }) {
  const selected = new Set(value);
  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  }
  return (
    <div className="chip-wrap">
      {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No tags yet.</span>}
      {tags.map((t) => (
        <TagChip key={t._id} tag={t} selected={selected.has(t._id)} onClick={() => toggle(t._id)} />
      ))}
      {onManage && (
        <button type="button" className="tag-chip pick" onClick={onManage} style={{ borderStyle: 'dashed' }}>
          + New tag
        </button>
      )}
    </div>
  );
}

export function NoteTags() {
  const { items: words, reload: reloadWords, viewingId } = useResource('/tag-words');
  const { items: tags, reload: reloadTags } = useResource('/note-tags');
  const { viewingSelf } = useAuth();
  const va = viewingId || undefined;

  const [newWord, setNewWord] = useState('');
  const [newTags, setNewTags] = useState([]);
  const [addError, setAddError] = useState('');
  const [query, setQuery] = useState('');
  const [filterTags, setFilterTags] = useState([]); // tag ids; '__none' = untagged
  const [editingWord, setEditingWord] = useState(null);
  const [showTags, setShowTags] = useState(false);

  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t._id, t])), [tags]);
  const wordCountByTag = useMemo(() => {
    const counts = {};
    for (const w of words) for (const id of w.tags || []) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, [words]);

  // Filtering: text search on the word, then tag chips. With several tag
  // chips on, a word shows if it has ANY of them.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = new Set(filterTags);
    return words
      .filter((w) => !q || w.word.toLowerCase().includes(q))
      .filter((w) => {
        if (wanted.size === 0) return true;
        const has = w.tags || [];
        if (wanted.has('__none') && has.length === 0) return true;
        return has.some((id) => wanted.has(id));
      })
      .sort((a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' }));
  }, [words, query, filterTags]);

  function findDuplicate(word, exceptId) {
    const w = word.trim().toLowerCase();
    return words.find((x) => x._id !== exceptId && x.word.trim().toLowerCase() === w);
  }

  async function addWord(e) {
    e.preventDefault();
    const word = newWord.trim();
    if (!word) return;
    if (findDuplicate(word)) {
      setAddError(`“${word}” is already in the list — edit it to change its tags.`);
      return;
    }
    setAddError('');
    await api.post('/tag-words', { word, tags: newTags }, va);
    setNewWord('');
    // Tags stay selected so a run of words with the same tags is quick to enter.
    await reloadWords();
  }

  async function saveWord(values) {
    await api.put(`/tag-words/${editingWord._id}`, values, va);
    await reloadWords();
  }

  async function deleteWord(w) {
    if (!confirm(`Delete “${w.word}”?`)) return;
    await api.del(`/tag-words/${w._id}`, va);
    await reloadWords();
  }

  function toggleFilter(id) {
    setFilterTags((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  // Tag manager callbacks
  async function createTag(values) {
    const created = await api.post('/note-tags', values, va);
    await reloadTags();
    return created;
  }
  async function updateTag(id, values) {
    await api.put(`/note-tags/${id}`, values, va);
    await reloadTags();
  }
  async function deleteTag(tag) {
    const n = wordCountByTag[tag._id] || 0;
    const msg = n
      ? `Delete the tag “${tag.name}”? It will be removed from ${n} word${n === 1 ? '' : 's'} (the words themselves stay).`
      : `Delete the tag “${tag.name}”?`;
    if (!confirm(msg)) return;
    await api.del(`/note-tags/${tag._id}`, va);
    setFilterTags((f) => f.filter((x) => x !== tag._id));
    setNewTags((t) => t.filter((x) => x !== tag._id));
    await Promise.all([reloadTags(), reloadWords()]);
  }

  const untaggedCount = words.filter((w) => !(w.tags || []).length).length;

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Vocabulary</div><h1>Note Tag</h1></div>
        <button className="btn ghost" onClick={() => setShowTags(true)}>
          Manage tags{tags.length ? ` (${tags.length})` : ''}
        </button>
      </div>

      {viewingSelf && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h"><h2>Add a word</h2></div>
          <form className="card-b" onSubmit={addWord}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                className="field"
                placeholder="Word"
                value={newWord}
                onChange={(e) => { setNewWord(e.target.value); setAddError(''); }}
                style={{ flex: 1 }}
              />
              <button className="btn" disabled={!newWord.trim()}>Add</button>
            </div>
            <TagPicker tags={tags} value={newTags} onChange={setNewTags} onManage={() => setShowTags(true)} />
            {addError && <div className="auth-error" style={{ marginTop: 10, marginBottom: 0 }}>{addError}</div>}
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h2>Words · {shown.length}{shown.length !== words.length ? ` of ${words.length}` : ''}</h2>
          <input
            className="field sm"
            placeholder="Search words…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 200 }}
          />
        </div>

        {(tags.length > 0 || untaggedCount > 0) && words.length > 0 && (
          <div className="chip-wrap" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600, marginRight: 2 }}>Filter</span>
            {tags.map((t) => (
              <button
                key={t._id}
                type="button"
                className="tag-chip pick"
                onClick={() => toggleFilter(t._id)}
                aria-pressed={filterTags.includes(t._id)}
                style={filterTags.includes(t._id) ? { background: tint(t.color), color: t.color, borderColor: 'transparent' } : undefined}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name} <span style={{ opacity: 0.6 }}>{wordCountByTag[t._id] || 0}</span>
              </button>
            ))}
            {untaggedCount > 0 && (
              <button
                type="button"
                className="tag-chip pick"
                onClick={() => toggleFilter('__none')}
                aria-pressed={filterTags.includes('__none')}
                style={filterTags.includes('__none') ? { background: 'var(--line)', borderColor: 'transparent' } : undefined}
              >
                Untagged <span style={{ opacity: 0.6 }}>{untaggedCount}</span>
              </button>
            )}
            {filterTags.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setFilterTags([])}>Clear</button>
            )}
          </div>
        )}

        {words.length === 0 ? (
          <div className="empty">
            <b>No words yet</b>
            {viewingSelf ? 'Add a word above and pick any tags for it.' : 'Nothing has been added here yet.'}
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">No words match the current search or filter.</div>
        ) : (
          <div className="stack">
            {shown.map((w) => (
              <div key={w._id} className="row" style={{ gridTemplateColumns: 'minmax(120px, 220px) 1fr auto' }}>
                <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{w.word}</div>
                <div className="chip-wrap">
                  {(w.tags || []).filter((id) => tagById[id]).map((id) => (
                    <TagChip key={id} tag={tagById[id]} small />
                  ))}
                  {!(w.tags || []).some((id) => tagById[id]) && (
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>No tags</span>
                  )}
                </div>
                {viewingSelf ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setEditingWord(w)}>Edit</button>
                    <button className="btn danger sm" onClick={() => deleteWord(w)}>Delete</button>
                  </div>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
      </div>

      {editingWord && (
        <WordEditModal
          word={editingWord}
          tags={tags}
          findDuplicate={findDuplicate}
          onSubmit={saveWord}
          onManageTags={() => setShowTags(true)}
          onClose={() => setEditingWord(null)}
        />
      )}

      {showTags && (
        <TagManagerModal
          tags={tags}
          counts={wordCountByTag}
          canEdit={viewingSelf}
          onCreate={createTag}
          onUpdate={updateTag}
          onDelete={deleteTag}
          onClose={() => setShowTags(false)}
        />
      )}
    </main>
  );
}

function WordEditModal({ word, tags, findDuplicate, onSubmit, onManageTags, onClose }) {
  const [text, setText] = useState(word.word);
  const [selected, setSelected] = useState(word.tags || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const w = text.trim();
    if (!w) return setError('Word is required');
    if (findDuplicate(w, word._id)) return setError(`“${w}” is already in the list`);
    setSaving(true);
    try {
      // Drop ids of tags that have since been deleted.
      await onSubmit({ word: w, tags: selected.filter((id) => tags.some((t) => t._id === id)) });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit word"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" form="word-edit-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="word-edit-form" onSubmit={submit}>
        <div className="field-row">
          <label>Word</label>
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
        <div className="field-row">
          <label>Tags</label>
          <TagPicker tags={tags} value={selected} onChange={setSelected} onManage={onManageTags} />
        </div>
      </form>
    </Modal>
  );
}

// Tag creation/management: create at the top, then each tag is editable in
// place (name + color) with its word count and a delete.
function TagManagerModal({ tags, counts, canEdit, onCreate, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[tags.length % TAG_COLORS.length]);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ name: '', color: '' });

  const isTaken = (n, exceptId) =>
    tags.some((t) => t._id !== exceptId && t.name.trim().toLowerCase() === n.trim().toLowerCase());

  async function create(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (isTaken(n)) return setError(`There's already a tag called “${n}”`);
    setError('');
    await onCreate({ name: n, color });
    setName('');
    setColor(TAG_COLORS[(tags.length + 1) % TAG_COLORS.length]);
  }

  function startEdit(t) {
    setEditId(t._id);
    setDraft({ name: t.name, color: t.color || TAG_COLORS[0] });
    setError('');
  }

  async function saveEdit() {
    const n = draft.name.trim();
    if (!n) return setError('Tag name is required');
    if (isTaken(n, editId)) return setError(`There's already a tag called “${n}”`);
    setError('');
    await onUpdate(editId, { name: n, color: draft.color });
    setEditId(null);
  }

  return (
    <Modal title="Tags" onClose={onClose} width={560}>
      {error && <div className="auth-error">{error}</div>}

      {canEdit && (
        <form onSubmit={create} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="field"
              placeholder="New tag name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              style={{ flex: 1 }}
              autoFocus
            />
            <button className="btn" disabled={!name.trim()}>Create</button>
          </div>
          <ColorSwatches value={color} onChange={setColor} />
        </form>
      )}

      {tags.length === 0 ? (
        <div className="empty"><b>No tags yet</b>Create one above, then pick it when adding words.</div>
      ) : (
        <div className="stack" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
          {tags.map((t) =>
            editId === t._id ? (
              <div key={t._id} style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="field"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }}
                  autoFocus
                />
                <ColorSwatches value={draft.color} onChange={(c) => setDraft((d) => ({ ...d, color: c }))} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn ghost sm" type="button" onClick={() => setEditId(null)}>Cancel</button>
                  <button className="btn sm" type="button" onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <div key={t._id} className="row" style={{ gridTemplateColumns: '1fr auto auto', padding: '10px 14px' }}>
                <div><TagChip tag={t} /></div>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  {counts[t._id] || 0} word{(counts[t._id] || 0) === 1 ? '' : 's'}
                </span>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => startEdit(t)}>Edit</button>
                    <button className="btn danger sm" onClick={() => onDelete(t)}>Delete</button>
                  </div>
                ) : <span />}
              </div>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

function ColorSwatches({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          aria-label={`Color ${c}`}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
            border: value === c ? '2px solid var(--ink)' : '2px solid transparent',
            boxShadow: '0 0 0 1px var(--line2)',
          }}
        />
      ))}
    </div>
  );
}
