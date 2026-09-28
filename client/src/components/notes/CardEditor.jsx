import { useEffect, useMemo, useRef, useState } from 'react';
import { notesApi } from '../../api/notes.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { FreeCanvas } from './FreeCanvas.jsx';
import { FixedEditor } from './FixedEditor.jsx';
import { CommentsPanel } from './CommentsPanel.jsx';
import { usePolling } from '../../hooks/usePolling.js';

// For 'text' anchors (fixed-doc highlights), a thread only reads as
// "resolved" on the page once every comment sharing that anchor is
// resolved — otherwise the highlight should stay live.
function resolvedTextAnchorIds(comments) {
  const byId = new Map();
  for (const c of comments) {
    if (c.anchor?.type === 'text' && c.anchor.commentId) {
      byId.set(c.anchor.commentId, [...(byId.get(c.anchor.commentId) || []), c.resolved]);
    }
  }
  const out = new Set();
  for (const [id, flags] of byId) {
    if (flags.length && flags.every(Boolean)) out.add(id);
  }
  return out;
}

export function CardEditor({ card, onClose, onSaved }) {
  const { viewingId, viewingSelf, user } = useAuth();
  // Server computes this per-viewer (owner, folder editor, or card editor
  // all count) — default true covers any older cached shape that predates
  // the field, so this never accidentally locks the owner out of their
  // own note.
  const canEdit = card.canEdit !== false;
  const [title, setTitle] = useState(card.title);
  const [elements, setElements] = useState(card.elements || []);
  const [html, setHtml] = useState(card.html || '');
  const [mediaMap, setMediaMap] = useState({});
  const [savedAt, setSavedAt] = useState(null);
  const [comments, setComments] = useState(card.comments || []);
  const [showPanel, setShowPanel] = useState(true);
  const [draft, setDraft] = useState(null); // { anchor: { type, commentId, quote } }
  const [focusAnchorId, setFocusAnchorId] = useState(null);
  const [focusElementId, setFocusElementId] = useState(null);
  const saveTimer = useRef(null);
  const fixedEditorRef = useRef(null);

  useEffect(() => {
    notesApi.mediaList(viewingId || undefined).then((list) => {
      setMediaMap(Object.fromEntries(list.map((a) => [a._id, a])));
    });
  }, [viewingId]);

  // Debounced autosave — fires 800ms after the last edit, for either mode.
  // Skipped entirely without edit access: there's nothing to save, and
  // the server would reject it anyway, so this avoids a pointless
  // network round-trip (and a console error) on every keystroke a
  // view-only visitor didn't actually make (typing is already disabled
  // in both editors below, but this is the belt-and-suspenders version).
  //
  // Two usage fixes: (1) this used to fire once on open with nothing
  // changed, so just opening a note cost a write; (2) it now compares
  // against what was last saved, so edits that end up back where they
  // started (or re-renders that rebuild an identical elements array)
  // don't send a PUT. Debounce is 1.5s so a burst of typing is one save.
  const lastSavedRef = useRef(
    JSON.stringify(card.mode === 'free' ? { title: card.title, elements: card.elements || [] } : { title: card.title, html: card.html || '' })
  );
  useEffect(() => {
    if (!canEdit) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, elements, html, canEdit]);

  async function save() {
    const patch = card.mode === 'free' ? { title, elements } : { title, html };
    const snapshot = JSON.stringify(patch);
    if (snapshot === lastSavedRef.current) return;
    const updated = await notesApi.updateCard(card._id, patch, viewingId || undefined);
    lastSavedRef.current = snapshot;
    setSavedAt(new Date());
    onSaved?.(updated);
  }

  // Comments are conversational — poll a bit more eagerly than the rest of
  // the app's 45s circle-sharing poll — but only refresh the comments
  // field, never the note body, so a co-viewer's activity can't clobber
  // whatever's mid-edit in the title/canvas/document here.
  //
  // Uses the comments-only endpoint (not the whole card), runs every 30s
  // instead of 15s, only while the comments panel is open, and pauses
  // while the tab is in the background (see usePolling).
  async function refreshComments() {
    try {
      const fresh = await notesApi.getComments(card._id, viewingId || undefined);
      setComments(fresh.comments || []);
    } catch {
      /* not fatal — next poll or action will retry */
    }
  }
  usePolling(refreshComments, 30000, showPanel);

  // Reflect resolved state onto the doc's highlight spans whenever the
  // comment list changes (see commentMark.js — this is display-only and
  // never gets written back into the saved HTML).
  useEffect(() => {
    if (card.mode === 'fixed') {
      fixedEditorRef.current?.applyResolvedState(resolvedTextAnchorIds(comments));
    }
  }, [comments, card.mode]);

  const commentCounts = useMemo(() => {
    const counts = {};
    for (const c of comments) {
      if (c.anchor?.type === 'element' && c.anchor.commentId) {
        counts[c.anchor.commentId] = (counts[c.anchor.commentId] || 0) + 1;
      }
    }
    return counts;
  }, [comments]);

  async function postComment(anchor, text) {
    const updated = await notesApi.addComment(card._id, { text, anchor }, viewingId || undefined);
    setComments(updated.comments || []);
  }

  async function handlePostDraft(text) {
    const anchor = draft?.anchor;
    setDraft(null);
    if (anchor) await postComment(anchor, text);
  }

  function handleCancelDraft() {
    if (draft?.anchor?.type === 'text') {
      fixedEditorRef.current?.removeCommentMark(draft.anchor.commentId);
    }
    setDraft(null);
  }

  async function handleAddGeneral(text) {
    await postComment({ type: 'card' }, text);
  }

  async function handleReply(anchor, text) {
    await postComment(anchor, text);
  }

  async function handleEditComment(commentId, text) {
    const updated = await notesApi.updateComment(card._id, commentId, { text }, viewingId || undefined);
    setComments(updated.comments || []);
  }

  async function handleToggleResolve(commentId, resolved) {
    const updated = await notesApi.updateComment(card._id, commentId, { resolved }, viewingId || undefined);
    setComments(updated.comments || []);
  }

  async function handleDeleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    const target = comments.find((c) => c._id === commentId);
    const updated = await notesApi.deleteComment(card._id, commentId, viewingId || undefined);
    const next = updated.comments || [];
    setComments(next);
    if (target?.anchor?.type === 'text' && target.anchor.commentId) {
      const stillReferenced = next.some((c) => c.anchor?.type === 'text' && c.anchor.commentId === target.anchor.commentId);
      if (!stillReferenced) fixedEditorRef.current?.removeCommentMark(target.anchor.commentId);
    }
  }

  // From the panel: clicking a thread's quoted text jumps back to it in
  // the note (the highlighted span for a fixed doc, the element itself
  // for a free-canvas card).
  function handleJumpToAnchor(commentId) {
    if (card.mode === 'fixed') fixedEditorRef.current?.scrollToComment(commentId);
    else setFocusElementId(commentId);
  }

  // From the fixed editor: clicking a highlighted span scrolls the panel
  // to the matching thread.
  function handleCommentMarkClick(commentId) {
    setShowPanel(true);
    setFocusAnchorId(commentId);
  }

  // From the fixed editor toolbar: a fresh selection has just been marked
  // and is waiting for its first comment.
  function handleRequestComment({ commentId, quote }) {
    setShowPanel(true);
    setDraft({ anchor: { type: 'text', commentId, quote } });
  }

  // From a canvas element's 💬 button.
  function handleElementComment(elementId) {
    setShowPanel(true);
    setDraft({ anchor: { type: 'element', commentId: elementId } });
  }

  return (
    <div>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{card.mode === 'free' ? 'Free canvas' : 'Fixed document'}</div>
          <input
            className="field"
            style={{ fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 600, border: 'none', padding: '4px 0', background: 'transparent' }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {!canEdit ? 'View only — you can still comment' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'All changes save automatically'}
          </span>
          <button className="btn ghost" onClick={() => setShowPanel((s) => !s)}>
            💬 {showPanel ? 'Hide' : 'Show'} comments{comments.length ? ` (${comments.length})` : ''}
          </button>
          <button className="btn ghost" onClick={async () => { if (canEdit) await save(); onClose(); }}>Done</button>
        </div>
      </div>

      <div className="note-editor-grid" style={{ display: 'grid', gridTemplateColumns: showPanel ? 'minmax(0,1fr) 300px' : '1fr', gap: 16, alignItems: 'flex-start' }}>
        <div>
          {card.mode === 'free' ? (
            <FreeCanvas
              elements={elements}
              onChange={setElements}
              mediaMap={mediaMap}
              onMediaMapNeedsRefresh={(asset) => setMediaMap((m) => ({ ...m, [asset._id]: asset }))}
              commentCounts={commentCounts}
              onElementComment={handleElementComment}
              focusElementId={focusElementId}
              readOnly={!canEdit}
            />
          ) : (
            <FixedEditor
              ref={fixedEditorRef}
              html={html}
              onChange={setHtml}
              onRequestComment={handleRequestComment}
              onCommentClick={handleCommentMarkClick}
              editable={canEdit}
            />
          )}
        </div>

        {showPanel && (
          <div className="card note-comments-panel" style={{ padding: 10, position: 'sticky', top: 12, height: '80vh', overflow: 'hidden' }}>
            <CommentsPanel
              comments={comments}
              currentUserId={user?.id}
              isOwner={viewingSelf}
              draft={draft}
              onPostDraft={handlePostDraft}
              onCancelDraft={handleCancelDraft}
              onAddGeneral={handleAddGeneral}
              onReply={handleReply}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              onToggleResolve={handleToggleResolve}
              onJumpToAnchor={handleJumpToAnchor}
              focusAnchorId={focusAnchorId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
