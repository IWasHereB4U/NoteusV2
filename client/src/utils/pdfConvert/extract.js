// Pulls positioned, styled text out of an already-opened pdfjs document.
// Takes the pdfjs document object (rather than importing pdfjs itself) so the
// same code runs in the browser and under Node for testing.

import { cleanFontName } from './docxBuilder.js';

const BOLD_RE = /bold|black|heavy|semibold|demi/i;
const ITALIC_RE = /italic|oblique/i;

function fontInfoFor(page, fontName, styles, cache) {
  if (cache.has(fontName)) return cache.get(fontName);
  const generic = styles?.[fontName]?.fontFamily || 'sans-serif';
  let rawName = '';
  try {
    rawName = page.commonObjs.get(fontName)?.name || '';
  } catch {
    // font not resolved — fall back to the generic family below
  }
  const info = {
    bold: BOLD_RE.test(rawName),
    italic: ITALIC_RE.test(rawName),
    family: cleanFontName(rawName, generic),
  };
  cache.set(fontName, info);
  return info;
}

export async function extractPages(pdfDoc, { onProgress } = {}) {
  const pages = [];
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const page = await pdfDoc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const [content] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

    const cache = new Map();
    const items = [];
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      const [a, b, , , e, f] = it.transform;
      const fontSize = Math.hypot(a, b) || it.height || 10;
      // Skip rotated text (diagonal watermarks, margin stamps).
      if (Math.abs(b) > Math.abs(a) * 0.1) continue;
      const info = fontInfoFor(page, it.fontName, content.styles, cache);
      items.push({ str: it.str, x: e, y: f, width: it.width, fontSize, ...info });
    }
    pages.push({ width: viewport.width, height: viewport.height, items });
    page.cleanup();
    onProgress?.(n, pdfDoc.numPages, 'read');
  }
  return pages;
}
