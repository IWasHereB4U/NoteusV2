import { useEffect, useRef, useState } from 'react';

// "1m ago" / "3h ago" / "5d ago" / falls back to a date past a week.
function relTime(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
}

function Avatar({ name, color }) {
  return (
    <span
      style={{
        width: 22, height: 22, borderRadius: '50%', background: color || 'var(--ink3)', color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

// Groups flat comments by anchor: text/element anchors with the same
// commentId form one thread (a highlighted phrase can collect several
// remarks); card-level comments each stand alone.
function groupComments(comments) {
  const order = [];
  const byKey = new Map();
  for (const c of comments) {
    const key = c.anchor?.type && c.anchor.type !== 'card' && c.anchor?.commentId ? c.anchor.commentId : `single-${c._id}`;
    if (!byKey.has(key)) {
      byKey.set(key, { key, anchor: c.anchor, items: [] });
      order.push(key);
    }
    byKey.get(key).items.push(c);
  }
  return order.map((k) => byKey.get(k));
}

function CommentItem({ comment, canModify, onEdit, onDelete, onToggleResolve }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);

  return (
    <div style={{ display: 'flex', gap: 8, opacity: comment.resolved ? 0.6 : 1 }}>
      <Avatar name={comment.authorName} color={comment.authorColor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{comment.authorName || 'Someone'}</span>
          <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{relTime(comment.createdAt)}</span>
          {comment.resolved && <span className="tag" style={{ fontSize: 9 }}>Resolved</span>}
        </div>
        {editing ? (
          <div style={{ marginTop: 4 }}>
            <textarea
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ minHeight: 50, fontSize: 12.5 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                className="btn sm"
                onClick={() => { if (text.trim()) { onEdit(text.trim()); setEditing(false); } }}
              >
                Save
              </button>
              <button className="btn ghost sm" onClick={() => { setText(comment.text); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textDecoration: comment.resolved ? 'line-through' : 'none' }}>
            {comment.text}
          </div>
        )}
        {!editing && canModify && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn ghost sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={onToggleResolve}>
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button className="btn ghost sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={() => setEditing(true)}>Edit</button>
            <button className="btn danger sm" style={{ fontSize: 10.5, padding: '2px 6px' }} onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyBox({ onSubmit }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn ghost sm" style={{ fontSize: 10.5, alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        + Reply
      </button>
    );
  }
  return (
    <div>
      <textarea
        className="field"
        placeholder="Reply…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ minHeight: 44, fontSize: 12.5 }}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          className="btn sm"
          onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(''); setOpen(false); } }}
        >
          Post
        </button>
        <button className="btn ghost sm" onClick={() => { setText(''); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

// Word-style margin comments: a scrolling list of threads, each anchored to
// either a highlighted span of text (fixed docs), a canvas element (free
// canvas), or the card as a whole. `draft` is a not-yet-posted thread —
// shown pinned at the top with an open composer — created the moment
// someone picks "Comment" on a fresh selection, before they've typed
// anything.
export function CommentsPanel({
  comments, currentUserId, isOwner, draft, onPostDraft, onCancelDraft,
  onAddGeneral, onReply, onEdit, onDelete, onToggleResolve, onJumpToAnchor, focusAnchorId,
}) {
  const [generalText, setGeneralText] = useState('');
  const groupRefs = useRef({});
  const groups = groupComments(comments || []);
  const unresolved = groups.filter((g) => !g.items.every((c) => c.resolved));
  const resolved = groups.filter((g) => g.items.every((c) => c.resolved) && g.items.length > 0);

  // Mirrors the editor's click-to-jump in the other direction: clicking a
  // highlighted span or a commented canvas element scrolls the panel to
  // that thread.
  useEffect(() => {
    if (focusAnchorId && groupRefs.current[focusAnchorId]) {
      groupRefs.current[focusAnchorId].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusAnchorId]);

  function canModify(c) {
    return isOwner || String(c.author) === String(currentUserId);
  }

  function renderAnchorLabel(anchor) {
    if (!anchor || anchor.type === 'card') return null;
    return (
      <div
        onClick={() => anchor.commentId && onJumpToAnchor?.(anchor.commentId)}
        title={anchor.commentId ? 'Jump to this in the note' : undefined}
        style={{
          fontSize: 11, color: 'var(--ink3)', fontStyle: 'italic', marginBottom: 6, cursor: anchor.commentId ? 'pointer' : 'default',
          borderLeft: '2px solid var(--line2)', paddingLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}
      >
        “{anchor.quote || (anchor.type === 'element' ? 'this element' : '')}”
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto', padding: '2px 2px 2px 4px' }}>
      {draft && (
        <div className="card" style={{ padding: 10, border: '1px solid var(--teal, #0E9C92)' }}>
          {renderAnchorLabel(draft.anchor)}
          <DraftComposer onPost={onPostDraft} onCancel={onCancelDraft} />
        </div>
      )}

      <div className="card" style={{ padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          New comment
        </div>
        <textarea
          className="field"
          placeholder="Comment on this note…"
          value={generalText}
          onChange={(e) => setGeneralText(e.target.value)}
          style={{ minHeight: 50, fontSize: 12.5 }}
        />
        <button
          className="btn sm"
          style={{ marginTop: 6 }}
          onClick={() => { if (generalText.trim()) { onAddGeneral(generalText.trim()); setGeneralText(''); } }}
        >
          Post
        </button>
      </div>

      {groups.length === 0 && !draft && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '0 4px' }}>
          No comments yet. Select text (or an element) and choose Comment, or leave a general note above.
        </div>
      )}

      {unresolved.map((g) => (
        <div key={g.key} ref={(el) => (groupRefs.current[g.key] = el)} className="card" style={{ padding: 10 }}>
          {renderAnchorLabel(g.anchor)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.items.map((c) => (
              <CommentItem
                key={c._id}
                comment={c}
                canModify={canModify(c)}
                onEdit={(text) => onEdit(c._id, text)}
                onDelete={() => onDelete(c._id)}
                onToggleResolve={() => onToggleResolve(c._id, !c.resolved)}
              />
            ))}
            {g.anchor?.type !== 'card' && <ReplyBox onSubmit={(text) => onReply(g.anchor, text)} />}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <details>
          <summary style={{ fontSize: 11, color: 'var(--ink3)', cursor: 'pointer', marginBottom: 6 }}>
            {resolved.length} resolved thread{resolved.length === 1 ? '' : 's'}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            {resolved.map((g) => (
              <div key={g.key} className="card" style={{ padding: 10 }}>
                {renderAnchorLabel(g.anchor)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.items.map((c) => (
                    <CommentItem
                      key={c._id}
                      comment={c}
                      canModify={canModify(c)}
                      onEdit={(text) => onEdit(c._id, text)}
                      onDelete={() => onDelete(c._id)}
                      onToggleResolve={() => onToggleResolve(c._id, !c.resolved)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DraftComposer({ onPost, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div>
      <textarea
        className="field"
        placeholder="Write a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ minHeight: 54, fontSize: 12.5 }}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="btn sm" onClick={() => text.trim() && onPost(text.trim())}>Comment</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
