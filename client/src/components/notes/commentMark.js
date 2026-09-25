import { Mark, mergeAttributes } from '@tiptap/core';

// Marks a span of text as attached to a comment thread. Deliberately
// carries only the id — resolved/unresolved state lives on the comment
// record itself (the source of truth), and is reflected onto these spans
// as a CSS class by the editor after the fact, rather than round-tripped
// through the saved HTML, so a stale save can never mismatch it.
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.commentId ? { 'data-comment-id': attrs.commentId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0];
  },

  addCommands() {
    return {
      setComment:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
