// Builds a docx Document from layout blocks (editable-text mode) or from
// rendered page images (snapshot mode). Works in the browser and in Node —
// the caller picks Packer.toBlob / Packer.toBuffer.

import {
  Document, Paragraph, TextRun, Tab, HeadingLevel, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, TableLayoutType, ImageRun, PageBreak,
} from 'docx';

const PT = 20; // twips per point

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

// PDF font names look like "ABCDEF+Arial-BoldMT" or "Times-Roman". Turn them
// into something Word will recognise (it substitutes anything it doesn't have).
export function cleanFontName(name = '', fallback = 'sans-serif') {
  let n = String(name).replace(/^[A-Z]{6}\+/, '');
  n = n.replace(/[-,](Bold|Italic|Oblique|BoldItalic|BoldOblique|Roman|Regular|Semibold|Light|Medium|Black)+.*$/i, '');
  n = n.replace(/(MT|PS|PSMT)$/i, '');
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  if (/^times/i.test(n)) return 'Times New Roman';
  if (/^helvetica/i.test(n) || /^arial/i.test(n)) return 'Arial';
  if (/^courier/i.test(n)) return 'Courier New';
  if (/^(symbol|zapf)/i.test(n)) return fallback === 'serif' ? 'Times New Roman' : 'Arial';
  if (n && /^[A-Za-z][A-Za-z0-9 ]{1,40}$/.test(n)) return n;
  if (fallback === 'serif') return 'Times New Roman';
  if (fallback === 'monospace') return 'Courier New';
  return 'Arial';
}

function makeRuns(runs, defaults) {
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const opts = {
      bold: r.bold || undefined,
      italics: r.italic || undefined,
      size: Math.max(2, Math.round(r.size * 2)),
      font: r.family && r.family !== defaults.family ? r.family : undefined,
    };
    const parts = r.text.split('\t');
    if (parts.length === 1) {
      out.push(new TextRun({ ...opts, text: r.text }));
    } else {
      const children = [];
      parts.forEach((p, i) => {
        if (i > 0) children.push(new Tab());
        if (p) children.push(p);
      });
      out.push(new TextRun({ ...opts, children }));
    }
  }
  return out;
}

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };

export function buildEditableDocument(analysis, pageInfo, { title = 'Converted document', keepPageBreaks = false } = {}) {
  const { blocks, bodyFamily, bodySize, margins } = analysis;
  const family = bodyFamily || 'Arial';
  const defaults = { family };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const marginLeft = clamp(Math.round((margins.left || 72) * PT), 36 * PT, 108 * PT);
  const marginRight = clamp(Math.round((margins.right || 72) * PT), 36 * PT, 108 * PT);
  const pageW = Math.round(pageInfo.width * PT);
  const pageH = Math.round(pageInfo.height * PT);
  const contentW = pageW - marginLeft - marginRight;

  const children = [];
  let lastPage = 0;

  for (const b of blocks) {
    const breakBefore = keepPageBreaks && b.page > lastPage;
    lastPage = b.page;

    if (b.type === 'table') {
      if (breakBefore) children.push(new Paragraph({ children: [new PageBreak()] }));
      const total = b.colWidths.reduce((a, c) => a + c, 0) || 1;
      const widths = b.colWidths.map((w) => Math.max(400, Math.round((w / total) * contentW)));
      const drift = contentW - widths.reduce((a, c) => a + c, 0);
      widths[widths.length - 1] += drift;
      children.push(
        new Table({
          width: { size: contentW, type: WidthType.DXA },
          columnWidths: widths,
          layout: TableLayoutType.FIXED,
          rows: b.rows.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cellRuns, ci) =>
                    new TableCell({
                      width: { size: widths[ci], type: WidthType.DXA },
                      margins: { top: 40, bottom: 40, left: 80, right: 80 },
                      children: [
                        new Paragraph({
                          spacing: { after: 0 },
                          children: makeRuns(cellRuns, defaults),
                        }),
                      ],
                    })
                ),
              })
          ),
        })
      );
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    const runs = makeRuns(b.runs, defaults);
    if (!runs.length) continue;

    if (b.type === 'heading') {
      children.push(
        new Paragraph({
          heading: HEADINGS[Math.min(b.level, 4) - 1],
          alignment: ALIGN[b.align] || AlignmentType.LEFT,
          pageBreakBefore: breakBefore || undefined,
          children: runs,
        })
      );
    } else if (b.type === 'bullet') {
      children.push(
        new Paragraph({
          numbering: { reference: 'bullets', level: b.level || 0 },
          pageBreakBefore: breakBefore || undefined,
          children: runs,
        })
      );
    } else {
      children.push(
        new Paragraph({
          alignment: ALIGN[b.align] || AlignmentType.LEFT,
          indent: b.indent ? { left: Math.round(b.indent * PT) } : undefined,
          pageBreakBefore: breakBefore || undefined,
          children: runs,
        })
      );
    }
  }

  if (!children.length) children.push(new Paragraph({ children: [] }));

  const bullet = (level) => ({
    level,
    format: LevelFormat.BULLET,
    text: ['•', '◦', '▪'][level],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  });

  const headingStyle = (id, name) => ({
    id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { color: '000000', bold: true },
    paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
  });

  return new Document({
    creator: 'NoteUs',
    title,
    styles: {
      default: {
        document: {
          run: { font: family, size: Math.max(16, Math.round((bodySize || 11) * 2)) },
          paragraph: { spacing: { after: 120, line: 276 } },
        },
      },
      paragraphStyles: [
        headingStyle('Heading1', 'Heading 1'),
        headingStyle('Heading2', 'Heading 2'),
        headingStyle('Heading3', 'Heading 3'),
        headingStyle('Heading4', 'Heading 4'),
      ],
    },
    numbering: { config: [{ reference: 'bullets', levels: [bullet(0), bullet(1), bullet(2)] }] },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageW, height: pageH },
            margin: { top: 72 * PT, bottom: 72 * PT, left: marginLeft, right: marginRight },
          },
        },
        children,
      },
    ],
  });
}

// Snapshot mode: one page image per section, sized to the original page.
// pages = [{ width, height (pt), png: Uint8Array }]
export function buildSnapshotDocument(pages, { title = 'Converted document' } = {}) {
  const PX = 96 / 72;
  return new Document({
    creator: 'NoteUs',
    title,
    sections: pages.map((p) => ({
      properties: {
        page: {
          size: { width: Math.round(p.width * PT), height: Math.round(p.height * PT) },
          margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 },
        },
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0, line: 240 },
          children: [
            new ImageRun({
              type: 'png',
              data: p.png,
              // A hair under the page size so Word doesn't spill onto a blank page.
              transformation: { width: Math.floor(p.width * PX) - 2, height: Math.floor(p.height * PX) - 4 },
            }),
          ],
        }),
      ],
    })),
  });
}
