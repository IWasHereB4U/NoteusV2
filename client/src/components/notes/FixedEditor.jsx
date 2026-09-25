import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { MediaLibrary } from './MediaLibrary.jsx';
import { CommentMark } from './commentMark.js';
import { mediaUrl } from '../../api/client.js';
import { countWords, countChars } from '../../utils/wordCount.js';

const COLORS = ['#0B1615', '#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5'];

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function Toolbar({ editor, onOpenMedia, onComment, editable }) {
  if (!editor) return null;
  const btn = (active, onClick, label, title) => (
    <button
      type="button"
      className={`btn ghost sm ${active ? 'on' : ''}`}
      // Fixed dark surface, not var(--ink) — that variable doubles as
      // body-text color and flips light in dark mode, which turned every
      // "active" toolbar button into a white pill with invisible text.
      // Same fix as .btn/.toast in index.css, just needed here too since
      // this is an inline style rather than a class.
      style={active ? { background: '#060D0C', color: '#fff' } : undefined}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--line)',
        background: 'var(--sunk)', position: 'sticky', top: 0, zIndex: 5, borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
      }}
    >
      {editable && (
        <>
          {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B', 'Bold')}
          {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I', 'Italic')}
          {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'U', 'Underline')}
          {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'S', 'Strikethrough')}
          <span style={{ width: 1, background: 'var(--line2)', margin: '0 2px' }} />
          {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1')}
          {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
          {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3')}
          {btn(editor.isActive('paragraph'), () => editor.chain().focus().setParagraph().run(), 'P')}
          <span style={{ width: 1, background: 'var(--line2)', margin: '0 2px' }} />
          {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '•list')}
          {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1.list')}
          {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), '❝')}
          {btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), '</>')}
          <span style={{ width: 1, background: 'var(--line2)', margin: '0 2px' }} />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); }}
              title={c}
              style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: '1px solid var(--line2)', cursor: 'pointer' }}
            />
          ))}
          <span style={{ width: 1, background: 'var(--line2)', margin: '0 2px' }} />
          {btn(false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'Table')}
          {btn(false, () => {
            const url = window.prompt('Link URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }, 'Link')}
          {btn(false, onOpenMedia, 'Media')}
        </>
      )}
      {btn(
        false,
        onComment,
        '💬 Comment',
        editor.state.selection.empty ? 'Select some text first' : 'Comment on the selected text'
      )}
      {editable && (
        <>
          {btn(false, () => editor.chain().focus().undo().run(), '↺')}
          {btn(false, () => editor.chain().focus().redo().run(), '↻')}
        </>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'center' }}>
        {!editable && (
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            View only — you can still leave comments
          </span>
        )}
        <WordCount editor={editor} />
      </span>
    </div>
  );
}

// Recomputed straight from the live doc on every render — tiptap's React
// binding already re-renders on each transaction, so this stays in sync
// without its own change listener.
function WordCount({ editor }) {
  const text = editor.getText();
  const words = countWords(text);
  const chars = countChars(text);
  return (
    <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--mono)' }} title={`${chars} characters`}>
      {words} {words === 1 ? 'word' : 'words'}
    </span>
  );
}

export const FixedEditor = forwardRef(function FixedEditor({ html, onChange, onRequestComment, onCommentClick, editable = true }, ref) {
  const [showMedia, setShowMedia] = useState(false);
  const containerRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      ImageExt,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
    ],
    content: html || '<p></p>',
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      handleClickOn(view, pos, node, nodePos, event) {
        const target = event.target?.closest?.('[data-comment-id]');
        if (target) onCommentClick?.(target.getAttribute('data-comment-id'));
        return false; // don't swallow the click — still place the cursor as normal
      },
    },
  });

  // Keep the editor in sync if the card is swapped out from under it.
  useEffect(() => {
    if (editor && html !== undefined && html !== editor.getHTML()) {
      editor.commands.setContent(html || '<p></p>', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // The `editable` option passed to useEditor above only sets the
  // *initial* state — TipTap needs setEditable() to react to it changing
  // afterward (e.g. CardEditor learning the permission check resolved).
  // Note this only gates typing/formatting: comment marks are still
  // applied via direct commands below, which bypass the editable flag —
  // selecting text and commenting stays available either way.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  function startComment() {
    if (!editor || editor.state.selection.empty) return null;
    const { from, to } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, ' ');
    const commentId = uid();
    // Deliberately no .focus() here — this needs to work identically
    // whether the doc is editable or read-only (a view-only editor can
    // still comment), and .focus() behaves inconsistently on a
    // non-editable ProseMirror view. Applying the mark is a direct
    // transaction dispatch either way, so it doesn't need focus first.
    editor.chain().setMark('comment', { commentId }).run();
    return { commentId, quote };
  }

  useImperativeHandle(ref, () => ({
    // Wraps the current selection in a fresh comment mark and hands back
    // its id + the selected text, so the caller can open a composer for it
    // without needing to know anything about ProseMirror.
    startComment: startComment,
    // Strips a comment mark entirely — used once a thread's last comment
    // is deleted (or a draft is cancelled before it's posted), so the
    // highlight doesn't linger with nothing behind it.
    removeCommentMark(commentId) {
      if (!editor) return;
      const markType = editor.state.schema.marks.comment;
      if (!markType) return;
      const { state, view } = editor;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        node.marks.forEach((mark) => {
          if (mark.type === markType && mark.attrs.commentId === commentId) {
            tr.removeMark(pos, pos + node.nodeSize, markType);
          }
        });
      });
      if (tr.docChanged) view.dispatch(tr);
    },
    // Reflects each comment's resolved state onto its marks as a CSS
    // class — a display concern only, never written back into the saved
    // HTML (see commentMark.js for why).
    applyResolvedState(resolvedIds) {
      const nodes = containerRef.current?.querySelectorAll('[data-comment-id]');
      nodes?.forEach((el) => {
        el.classList.toggle('resolved', resolvedIds.has(el.getAttribute('data-comment-id')));
      });
    },
    scrollToComment(commentId) {
      const el = containerRef.current?.querySelector(`[data-comment-id="${commentId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('comment-flash');
      setTimeout(() => el.classList.remove('comment-flash'), 1200);
    },
  }), [editor]);

  return (
    <div className="card">
      <Toolbar
        editor={editor}
        editable={editable}
        onOpenMedia={() => setShowMedia(true)}
        onComment={() => {
          const result = startComment();
          if (result) onRequestComment?.(result);
        }}
      />
      <div ref={containerRef} style={{ padding: '18px 22px', minHeight: 420 }}>
        <EditorContent editor={editor} />
      </div>
      {showMedia && (
        <MediaLibrary
          onSelect={(asset) => {
            if (asset.kind === 'image') editor.chain().focus().setImage({ src: mediaUrl(asset.url) }).run();
            else {
              // TipTap has no built-in video node; insert as a raw embed.
              editor.chain().focus().insertContent(
                `<video src="${mediaUrl(asset.url)}" controls style="max-width:100%;border-radius:8px"></video><p></p>`
              ).run();
            }
            setShowMedia(false);
          }}
          onClose={() => setShowMedia(false)}
        />
      )}
    </div>
  );
});
