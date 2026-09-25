// Shared word/character counting for the Notes editors (both the tiptap
// "fixed document" and the free-canvas text blocks store their content as
// HTML, so counting words means stripping tags first rather than counting
// markup as text).

export function stripHtml(html) {
  if (!html) return '';
  // A detached element never touches the DOM tree, so this is safe to run
  // outside a browser-rendered context and doesn't trigger layout/paint.
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

export function countWords(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countChars(text) {
  return (text || '').length;
}

// Convenience for HTML-sourced content — strips tags, then counts.
export function countWordsInHtml(html) {
  const text = stripHtml(html);
  return { words: countWords(text), chars: countChars(text) };
}
