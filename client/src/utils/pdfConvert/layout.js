// Layout analysis for PDF -> Word conversion. Pure functions (no DOM, no
// pdfjs import) so it can run in the browser and be unit-tested in Node.
//
// Input is one object per page:
//   { width, height, items: [{ str, x, y, width, fontSize, bold, italic, family }] }
// with x/y in PDF points (origin bottom-left, y grows upward) — exactly what
// pdfjs's getTextContent() transform gives, plus font info resolved by the
// caller.
//
// Output is a flat list of blocks the docx builder understands:
//   { type: 'heading', level, runs, align, page }
//   { type: 'para',    runs, align, indent, page, lastX1 }
//   { type: 'bullet',  runs, level, page }
//   { type: 'table',   rows: [[runs, ...]], colWidths (pt), page }
// A run is { text, bold, italic, size (pt), family }. '\t' inside text is a tab.

const BULLET_RE = /^[•●▪■◦‣·○▫–—*-]\s+/;
const NUMBER_RE = /^(\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,5}[.)])\s+/;
const TERMINAL_RE = /[.!?:;"”')\]]$/;

const round05 = (n) => Math.round(n * 2) / 2;

// ---------- 1. items -> lines ----------

function dedupeItems(items) {
  // Some generators fake bold by drawing the same text twice, offset by <1pt.
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const key = `${it.str}|${Math.round(it.x)}|${Math.round(it.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function sameStyle(a, b) {
  return a.bold === b.bold && a.italic === b.italic && Math.abs(a.size - b.size) < 0.6 && a.family === b.family;
}

function pushRun(runs, text, style) {
  const last = runs[runs.length - 1];
  if (last && sameStyle(last, style)) last.text += text;
  else runs.push({ text, ...style });
}

function buildLine(group, pageWidth) {
  const items = [...group.items].sort((a, b) => a.x - b.x);
  const runs = [];
  let prevEnd = null;
  let prevItem = null;
  let x0 = Infinity;
  let x1 = -Infinity;
  const cells = []; // [{x0,x1}] — columns separated by wide gaps
  let cell = null;
  const sizeWeight = new Map();

  for (const it of items) {
    const style = { bold: it.bold, italic: it.italic, size: it.fontSize, family: it.family };
    const isSpace = it.str.trim() === '';
    const gap = prevEnd === null ? 0 : it.x - prevEnd;
    const fs = it.fontSize || 10;
    const cellGap = Math.max(fs * 1.8, 14);

    let sep = '';
    if (prevEnd !== null) {
      if (gap > cellGap) sep = '\t';
      else if (gap > fs * 0.12) sep = ' ';
    }
    // Don't double up spaces the source text already carries.
    const prevText = runs.length ? runs[runs.length - 1].text : '';
    if (sep === ' ' && (prevText.endsWith(' ') || it.str.startsWith(' '))) sep = '';

    // pdfjs emits whitespace-only items that span the gap between words or
    // columns. Spacing is derived from the real gaps between visible text
    // instead, so ignore them (otherwise they mask column gaps).
    if (isSpace) continue;

    if (sep) pushRun(runs, sep, prevItem ? { bold: prevItem.bold, italic: prevItem.italic, size: prevItem.fontSize, family: prevItem.family } : style);
    pushRun(runs, it.str, style);

    if (!cell || sep === '\t') {
      cell = { x0: it.x, x1: it.x + it.width };
      cells.push(cell);
    } else {
      cell.x1 = it.x + it.width;
    }
    x0 = Math.min(x0, it.x);
    x1 = Math.max(x1, it.x + it.width);
    sizeWeight.set(round05(it.fontSize), (sizeWeight.get(round05(it.fontSize)) || 0) + it.str.length);
    prevEnd = it.x + it.width;
    prevItem = it;
  }

  if (!runs.length || x0 === Infinity) return null;
  // Trim trailing whitespace on the last run.
  runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  if (!runs[runs.length - 1].text) runs.pop();
  if (!runs.length) return null;

  let fontSize = 0;
  let best = -1;
  for (const [s, w] of sizeWeight) if (w > best) { best = w; fontSize = s; }
  const text = runs.map((r) => r.text).join('');

  return { y: group.y, x0, x1, fontSize, runs, text, cells, pageWidth };
}

export function buildLines(page) {
  const items = dedupeItems(page.items).filter((it) => it.str !== '');
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups = [];
  for (const it of sorted) {
    let g = null;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 3; i--) {
      const tol = Math.max(1.5, 0.45 * Math.max(it.fontSize, groups[i].maxSize));
      if (Math.abs(groups[i].y - it.y) <= tol) { g = groups[i]; break; }
    }
    if (!g) { g = { y: it.y, items: [], maxSize: 0 }; groups.push(g); }
    g.items.push(it);
    g.maxSize = Math.max(g.maxSize, it.fontSize);
  }
  return groups.map((g) => buildLine(g, page.width)).filter(Boolean);
}

// ---------- 2. strip running headers / footers / page numbers ----------

function normKey(text) {
  return text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stripHeadersFooters(pagesLines, pages) {
  if (pagesLines.length < 2) return pagesLines;
  const counts = new Map();
  pagesLines.forEach((lines, pi) => {
    const { height } = pages[pi];
    const seenOnPage = new Set();
    for (const l of lines) {
      if (l.y > height * 0.91 || l.y < height * 0.09) {
        const k = normKey(l.text);
        if (k && !seenOnPage.has(k)) {
          seenOnPage.add(k);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
  });
  const threshold = Math.max(2, Math.ceil(pagesLines.length * 0.5));
  return pagesLines.map((lines, pi) => {
    const { height } = pages[pi];
    return lines.filter((l) => {
      if (l.y > height * 0.91 || l.y < height * 0.09) return (counts.get(normKey(l.text)) || 0) < threshold;
      return true;
    });
  });
}

// ---------- 3. tables ----------

function aligned(a, b, tol = 6) {
  const ca = (a.x0 + a.x1) / 2;
  const cb = (b.x0 + b.x1) / 2;
  return Math.abs(a.x0 - b.x0) <= tol || Math.abs(a.x1 - b.x1) <= tol || Math.abs(ca - cb) <= tol;
}

function rowsAlign(rowA, rowB) {
  if (rowA.cells.length !== rowB.cells.length) return false;
  return rowA.cells.every((c, i) => aligned(c, rowB.cells[i]));
}

// Splits one line's runs into per-cell run lists on the '\t' separators.
function splitCells(line) {
  const cellsRuns = [[]];
  for (const run of line.runs) {
    const parts = run.text.split('\t');
    parts.forEach((part, i) => {
      if (i > 0) cellsRuns.push([]);
      if (part) cellsRuns[cellsRuns.length - 1].push({ ...run, text: part });
    });
  }
  return cellsRuns.map((runs) => {
    if (runs.length) runs[0].text = runs[0].text.replace(/^\s+/, '');
    return runs;
  });
}

// Returns segments: { table: [lines] } or { line }.
function findTables(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.cells.length >= 2) {
      let j = i + 1;
      while (
        j < lines.length &&
        lines[i].cells.length === lines[j].cells.length &&
        lines[j - 1].y - lines[j].y < lines[j].fontSize * 3.2 &&
        rowsAlign(lines[i], lines[j])
      ) j++;
      if (j - i >= 2) {
        out.push({ table: lines.slice(i, j) });
        i = j;
        continue;
      }
    }
    out.push({ line: l });
    i++;
  }
  return out;
}

// ---------- 4. lines -> paragraphs ----------

function stripMarker(runs, re) {
  const out = runs.map((r) => ({ ...r }));
  const first = out[0];
  first.text = first.text.replace(re, '');
  if (!first.text) out.shift();
  return out;
}

function joinRuns(target, extra) {
  // Joins two runs lists across a line wrap, de-hyphenating when it looks
  // like a soft hyphen ("inter-" / "national").
  const t = target.map((r) => ({ ...r }));
  const e = extra.map((r) => ({ ...r }));
  const last = t[t.length - 1];
  const nextFirst = e[0];
  if (last && nextFirst && /[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(nextFirst.text)) {
    last.text = last.text.slice(0, -1);
  } else if (last && nextFirst) {
    last.text += ' ';
  }
  for (const r of e) pushRun(t, r.text, r);
  return t;
}

function textOf(runs) {
  return runs.map((r) => r.text).join('');
}

function paragraphsFromLines(lines, page, ctx) {
  const blocks = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const text = textOf(cur.runs).trim();
    if (text) {
      const first = cur.lines[0];
      const centerX = (first.x0 + first.x1) / 2;
      const isCentered =
        cur.lines.length <= 3 &&
        Math.abs(centerX - page.width / 2) < page.width * 0.025 &&
        first.x0 - ctx.leftMargin > page.width * 0.06;
      blocks.push({
        type: cur.kind === 'bullet' ? 'bullet' : 'para',
        runs: cur.runs,
        align: isCentered ? 'center' : 'left',
        x0: first.x0,
        lastX1: cur.lines[cur.lines.length - 1].x1,
        lineCount: cur.lines.length,
        size: Math.max(...cur.lines.map((l) => l.fontSize)),
        page: page.index,
      });
    }
    cur = null;
  };

  for (const seg of findTables(lines)) {
    if (seg.table) {
      flush();
      const rows = seg.table.map(splitCells);
      const first = seg.table[0];
      const starts = first.cells.map((c) => c.x0);
      const ends = [...starts.slice(1), Math.max(...seg.table.map((l) => l.x1))];
      blocks.push({
        type: 'table',
        rows,
        colWidths: starts.map((s, i) => Math.max(20, ends[i] - s)),
        page: page.index,
      });
      continue;
    }

    const line = seg.line;
    const isBullet = BULLET_RE.test(line.text);
    const isNumbered = !isBullet && NUMBER_RE.test(line.text);

    let newPara = !cur;
    if (cur) {
      const prev = cur.lines[cur.lines.length - 1];
      const gap = prev.y - line.y;
      const sizeChanged = Math.abs(line.fontSize - prev.fontSize) > Math.max(1, prev.fontSize * 0.12);
      const prevText = textOf(cur.runs).trim();
      const indented = line.x0 - prev.x0 > prev.fontSize * 1.0;
      const prevShort = prev.x1 < ctx.rightEdge - ctx.contentWidth * 0.15;
      if (gap > prev.fontSize * 1.65 + 0.5) newPara = true;
      else if (sizeChanged) newPara = true;
      else if (isBullet || isNumbered) newPara = true;
      else if (indented && TERMINAL_RE.test(prevText) && cur.kind !== 'bullet') newPara = true;
      else if (prevShort && TERMINAL_RE.test(prevText)) newPara = true;
    }

    if (newPara) {
      flush();
      cur = {
        kind: isBullet ? 'bullet' : 'para',
        runs: isBullet ? stripMarker(line.runs, BULLET_RE) : line.runs.map((r) => ({ ...r })),
        lines: [line],
      };
    } else {
      cur.runs = joinRuns(cur.runs, line.runs);
      cur.lines.push(line);
    }
  }
  flush();
  return blocks;
}

// ---------- 5. document-level pass ----------

function weightedMode(values) {
  const m = new Map();
  for (const { v, w } of values) m.set(v, (m.get(v) || 0) + w);
  let best = null;
  let bw = -1;
  for (const [v, w] of m) if (w > bw) { bw = w; best = v; }
  return best;
}

export function analyzePages(pages, { removeHeadersFooters = true, keepPageBreaks = false } = {}) {
  pages.forEach((p, i) => { p.index = i; });
  let pagesLines = pages.map(buildLines);
  if (removeHeadersFooters) pagesLines = stripHeadersFooters(pagesLines, pages);

  const allLines = pagesLines.flat();
  const charCount = allLines.reduce((n, l) => n + l.text.length, 0);
  if (!allLines.length) return { blocks: [], charCount: 0, bodyFamily: 'Arial', margins: { left: 72, right: 72 } };

  const bodySize = weightedMode(allLines.map((l) => ({ v: round05(l.fontSize), w: l.text.length })));
  const leftMargins = allLines.map((l) => l.x0).sort((a, b) => a - b);
  const rightEdges = allLines.map((l) => l.x1).sort((a, b) => a - b);
  const leftMargin = leftMargins[Math.floor(leftMargins.length * 0.1)];
  const rightEdge = rightEdges[Math.floor(rightEdges.length * 0.92)];
  const ctx = { bodySize, leftMargin, rightEdge, contentWidth: Math.max(1, rightEdge - leftMargin) };

  const bodyFamily = weightedMode(
    allLines.flatMap((l) => l.runs.map((r) => ({ v: r.family, w: r.text.length })))
  );

  let blocks = pages.flatMap((p, i) => paragraphsFromLines(pagesLines[i], p, ctx));

  // Headings: noticeably larger than body text, short.
  const headingSizes = [];
  for (const b of blocks) {
    if (b.type === 'para' && b.size >= bodySize * 1.18 && b.lineCount <= 3 && textOf(b.runs).length < 200) {
      headingSizes.push(round05(b.size));
    }
  }
  const levels = [...new Set(headingSizes)].sort((a, b) => b - a);
  blocks = blocks.map((b) => {
    if (b.type === 'para' && b.size >= bodySize * 1.18 && b.lineCount <= 3 && textOf(b.runs).length < 200) {
      const level = Math.min(levels.indexOf(round05(b.size)) + 1, 4);
      return { ...b, type: 'heading', level };
    }
    return b;
  });

  // Bullet nesting from indentation.
  const bulletXs = blocks.filter((b) => b.type === 'bullet').map((b) => b.x0);
  const minBulletX = bulletXs.length ? Math.min(...bulletXs) : 0;
  for (const b of blocks) {
    if (b.type === 'bullet') b.level = Math.max(0, Math.min(2, Math.round((b.x0 - minBulletX) / 20)));
    if (b.type === 'para') {
      const ind = b.x0 - leftMargin;
      b.indent = ind > ctx.bodySize * 1.5 && b.align !== 'center' ? Math.min(ind, 144) : 0;
    }
  }

  // Merge a paragraph that runs over a page boundary.
  if (!keepPageBreaks) {
    const merged = [];
    for (const b of blocks) {
      const prev = merged[merged.length - 1];
      if (
        prev && prev.type === 'para' && b.type === 'para' && b.page === prev.page + 1 &&
        prev.lastX1 > ctx.rightEdge - ctx.contentWidth * 0.2 &&
        !TERMINAL_RE.test(textOf(prev.runs).trim()) &&
        prev.align === 'left' && b.align === 'left'
      ) {
        prev.runs = joinRuns(prev.runs, b.runs);
        prev.lastX1 = b.lastX1;
        prev.page = b.page;
        continue;
      }
      merged.push(b);
    }
    blocks = merged;
  }

  return {
    blocks,
    charCount,
    bodySize,
    bodyFamily,
    margins: { left: leftMargin, right: pages[0].width - rightEdge },
  };
}
