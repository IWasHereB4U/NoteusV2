import { useEffect, useMemo, useState } from 'react';
import { notesApi } from '../api/notes.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FolderTree } from '../components/notes/FolderTree.jsx';
import { PasswordPrompt } from '../components/notes/PasswordPrompt.jsx';
import { FormModal } from '../components/Modal.jsx';
import { CardEditor } from '../components/notes/CardEditor.jsx';

const FOLDER_FIELDS = [
  { k: 'name', label: 'Folder name', required: true },
  { k: 'password', label: 'Password (optional) — leave blank for no lock', type: 'password' },
];

const SORT_OPTIONS = [
  ['updated', 'Last edited'],
  ['name', 'Alphabetical'],
];

export function Notes() {
  const { viewingId, viewingSelf, circle } = useAuth();
  const [folders, setFolders] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(() => new Set());
  const [currentFolder, setCurrentFolder] = useState(null);
  const [pendingUnlock, setPendingUnlock] = useState(null); // folder awaiting password
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [cards, setCards] = useState([]);
  const [sortBy, setSortBy] = useState('updated'); // 'updated' | 'name'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
  const [creatingCardMode, setCreatingCardMode] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [movingCard, setMovingCard] = useState(null); // card awaiting a destination folder
  const [managingEditorsFor, setManagingEditorsFor] = useState(null); // { kind: 'folder'|'card', item }

  // Only people who already have Notes shared with them at all are
  // eligible for a folder/card-level edit grant — granting "edit" to
  // someone who can't even view Notes would be a no-op, and would just
  // be confusing to show in the picker.
  const eligiblePeople = (circle?.sharing || []).filter((p) => p.sharedModules.includes('notes'));

  // Sorting is purely a display concern over whatever the server already
  // returned — no need to re-fetch on a sort change. "Last edited" uses
  // updatedAt; "Alphabetical" is case-insensitive on title so "apple"
  // and "Apple" land next to each other rather than by ASCII case.
  const sortedCards = useMemo(() => {
    const list = [...cards];
    list.sort((a, b) => {
      const cmp =
        sortBy === 'name'
          ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          : new Date(a.updatedAt) - new Date(b.updatedAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [cards, sortBy, sortDir]);

  async function loadFolders() {
    setFolders(await notesApi.folders(viewingId || undefined));
  }
  useEffect(() => { loadFolders(); setCurrentFolder(null); setCards([]); }, [viewingId]); // eslint-disable-line

  async function loadCards(folderId) {
    setCards(await notesApi.cards(folderId, viewingId || undefined));
  }
  function selectFolder(folder) {
    if (folder.locked && !unlockedIds.has(folder._id)) {
      setPendingUnlock(folder);
      return;
    }
    setCurrentFolder(folder);
    loadCards(folder._id);
  }

  async function unlock(password) {
    await notesApi.unlockFolder(pendingUnlock._id, password, viewingId || undefined);
    setUnlockedIds((s) => new Set(s).add(pendingUnlock._id));
    setCurrentFolder(pendingUnlock);
    loadCards(pendingUnlock._id);
    setPendingUnlock(null);
  }

  async function createFolder(values) {
    await notesApi.createFolder(
      { name: values.name, password: values.password || undefined, parent: currentFolder?._id || null },
      viewingId || undefined
    );
    await loadFolders();
  }

  async function createCard(mode) {
    const card = await notesApi.createCard(
      { folder: currentFolder._id, mode, title: 'Untitled' },
      viewingId || undefined
    );
    setCreatingCardMode(null);
    await loadCards(currentFolder._id);
    setOpenCard(card);
  }

  async function deleteCard(id) {
    if (!confirm('Delete this card?')) return;
    await notesApi.deleteCard(id, viewingId || undefined);
    loadCards(currentFolder._id);
  }

  // Cards always belong to exactly one folder (the schema requires it —
  // there's no "unfiled" state), so moving is just repointing that field;
  // the generic PUT route already accepts a bare { folder } patch.
  async function moveCard(destFolder) {
    if (!movingCard || String(destFolder._id) === String(movingCard.folder)) return;
    await notesApi.updateCard(movingCard._id, { folder: destFolder._id }, viewingId || undefined);
    setMovingCard(null);
    await loadCards(currentFolder._id);
  }

  // Toggles one person's membership in an editors list (folder-wide or
  // one specific card) and persists it. Owner-only in practice — the
  // "Share" trigger that opens this is itself gated on viewingSelf — but
  // the server re-checks independently regardless.
  async function toggleEditor(personId) {
    if (!managingEditorsFor) return;
    const { kind, item } = managingEditorsFor;
    const current = item.editors || [];
    const next = current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId];

    if (kind === 'folder') {
      const updated = await notesApi.renameFolder(item._id, { editors: next }, viewingId || undefined);
      await loadFolders();
      if (currentFolder?._id === item._id) setCurrentFolder((f) => ({ ...f, editors: updated.editors }));
      setManagingEditorsFor({ kind, item: { ...item, editors: updated.editors } });
    } else {
      const updated = await notesApi.updateCard(item._id, { editors: next }, viewingId || undefined);
      await loadCards(currentFolder._id);
      setManagingEditorsFor({ kind, item: { ...item, editors: updated.editors } });
    }
  }

  async function deleteFolder(f) {
    if (!confirm(`Delete "${f.name}" and everything inside it? This can't be undone.`)) return;
    await notesApi.deleteFolder(f._id, viewingId || undefined);
    if (currentFolder?._id === f._id) setCurrentFolder(null);
    loadFolders();
  }

  if (openCard) {
    return (
      <main className="page">
        <CardEditor
          card={openCard}
          onClose={() => { setOpenCard(null); loadCards(currentFolder._id); }}
          onSaved={(updated) => setCards((cs) => cs.map((c) => (c._id === updated._id ? updated : c)))}
        />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Workspace</div><h1>Notes</h1></div>
      </div>

      <div className="notes-layout" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Folders</span>
            {viewingSelf && <button className="btn ghost sm" onClick={() => setCreatingFolder(true)}>+ New</button>}
          </div>
          <button
            onClick={() => { setCurrentFolder(null); setCards([]); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', background: !currentFolder ? 'var(--sunk)' : 'none', border: 0, borderRadius: 8, padding: '7px 9px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}
          >
            🏠 All folders
          </button>
          <FolderTree folders={folders} currentId={currentFolder?._id} unlockedIds={unlockedIds} onSelect={selectFolder} />
        </div>

        <div>
          {!currentFolder ? (
            <div className="card"><div className="empty"><b>Pick a folder</b>Select one from the left, or create a new one to start adding notes.</div></div>
          ) : (
            <>
              <div className="card-h" style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg) var(--r-lg) 0 0' }}>
                <div>
                  <h2>{currentFolder.name}{currentFolder.locked ? ' · locked' : ''}</h2>
                  {currentFolder.editors?.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {currentFolder.editors.length} {currentFolder.editors.length === 1 ? 'person' : 'people'} can edit this folder
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {cards.length > 1 && (
                    <>
                      <select
                        className="field sm"
                        style={{ width: 'auto' }}
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                      >
                        {SORT_OPTIONS.map(([key, label]) => (
                          <option key={key} value={key}>Sort: {label}</option>
                        ))}
                      </select>
                      <button
                        className="btn ghost sm"
                        title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                        onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      >
                        {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                      </button>
                      <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line2)', margin: '0 2px' }} />
                    </>
                  )}
                  {(viewingSelf || currentFolder.canEdit) && (
                    <button className="btn ghost sm" onClick={() => setCreatingCardMode('choose')}>+ New card</button>
                  )}
                  {viewingSelf && (
                    <>
                      <button className="btn ghost sm" onClick={() => setManagingEditorsFor({ kind: 'folder', item: currentFolder })}>Share</button>
                      <button className="btn danger sm" onClick={() => deleteFolder(currentFolder)}>Delete folder</button>
                    </>
                  )}
                </div>
              </div>
              <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                {cards.length === 0 ? (
                  <div className="empty"><b>No cards yet</b>Add a free canvas or a fixed document to this folder.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, padding: 16 }}>
                    {sortedCards.map((c) => (
                      <div key={c._id} className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setOpenCard(c)}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className={`tag ${c.mode === 'free' ? 'ochre' : 'green'}`}>{c.mode}</span>
                          {c.editors?.length > 0 && <span className="tag" style={{ background: 'var(--sunk)', color: 'var(--ink3)' }}>{c.editors.length} editor{c.editors.length === 1 ? '' : 's'}</span>}
                        </div>
                        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16, margin: '8px 0 4px' }}>{c.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Updated {new Date(c.updatedAt).toLocaleDateString()}</div>
                        {(viewingSelf || c.canDelete) && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {viewingSelf && <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setMovingCard(c); }}>Move</button>}
                            {viewingSelf && <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setManagingEditorsFor({ kind: 'card', item: c }); }}>Share</button>}
                            <button className="btn danger sm" onClick={(e) => { e.stopPropagation(); deleteCard(c._id); }}>Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {creatingFolder && (
        <FormModal
          title={currentFolder ? `New folder inside "${currentFolder.name}"` : 'New folder'}
          fields={FOLDER_FIELDS}
          onSubmit={createFolder}
          onClose={() => setCreatingFolder(false)}
        />
      )}

      {pendingUnlock && (
        <PasswordPrompt
          title={`Unlock "${pendingUnlock.name}"`}
          onSubmit={unlock}
          onClose={() => setPendingUnlock(null)}
        />
      )}

      {creatingCardMode === 'choose' && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCreatingCardMode(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-h"><h3>New card</h3><button onClick={() => setCreatingCardMode(null)}>×</button></div>
            <div className="modal-b" style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => createCard('free')}>Free canvas</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => createCard('fixed')}>Fixed document</button>
            </div>
          </div>
        </div>
      )}

      {movingCard && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setMovingCard(null)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-h"><h3>Move "{movingCard.title}"</h3><button onClick={() => setMovingCard(null)}>×</button></div>
            <div className="modal-b">
              {folders.filter((f) => String(f._id) !== String(movingCard.folder)).length === 0 ? (
                <div className="empty"><b>No other folders yet</b>Create another folder first, then you can move cards into it.</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Choose a destination folder:</div>
                  <FolderTree
                    folders={folders}
                    currentId={movingCard.folder}
                    unlockedIds={unlockedIds}
                    onSelect={moveCard}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {managingEditorsFor && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setManagingEditorsFor(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-h">
              <h3>
                Who can edit {managingEditorsFor.kind === 'folder' ? `"${managingEditorsFor.item.name}"` : `"${managingEditorsFor.item.title}"`}
              </h3>
              <button onClick={() => setManagingEditorsFor(null)}>×</button>
            </div>
            <div className="modal-b">
              <p style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 0 }}>
                {managingEditorsFor.kind === 'folder'
                  ? "Checked people can create, edit, and delete any card in this folder — not just view it."
                  : "Checked people can edit this one card's content. They still can't delete it or move it — that stays with you (or a folder-level editor)."}
              </p>
              {eligiblePeople.length === 0 ? (
                <div className="empty">
                  <b>Nobody to add yet</b>
                  Share the Notes module with someone from the Circle page first, then they'll show up here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {eligiblePeople.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={(managingEditorsFor.item.editors || []).includes(p.id)}
                        onChange={() => toggleEditor(p.id)}
                      />
                      <span>
                        {p.name} <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{p.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
