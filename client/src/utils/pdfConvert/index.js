// Browser entry point: File (PDF) -> Blob (.docx).
// pdfjs and docx are loaded lazily so they only cost bytes when someone
// actually opens the converter.

import { extractPages } from './extract.js';
import { analyzePages } from './layout.js';
import { Packer } from 'docx';
import { buildEditableDocument, buildSnapshotDocument } from './docxBuilder.js';

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

async function openPdf(file, requestPassword) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  task.onPassword = (update, reason) => {
    const retry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    const pw = requestPassword?.(retry);
    if (pw == null || pw === '') {
      task.destroy();
      return;
    }
    update(pw);
  };
  try {
    return await task.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') throw new Error('This PDF is password-protected and no valid password was given.');
    if (err?.name === 'InvalidPDFException') throw new Error('This file does not look like a valid PDF.');
    throw err;
  }
}

async function renderSnapshots(pdfDoc, onProgress) {
  const out = [];
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const page = await pdfDoc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    // ~2x for sharpness, but cap the canvas so big pages don't blow memory.
    const scale = Math.min(2, 3000 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    out.push({ width: base.width, height: base.height, png: new Uint8Array(await blob.arrayBuffer()) });
    canvas.width = canvas.height = 0;
    page.cleanup();
    onProgress?.(n, pdfDoc.numPages, 'render');
  }
  return out;
}

/**
 * @param {File} file
 * @param {{ mode?: 'text'|'snapshot', removeHeadersFooters?: boolean, keepPageBreaks?: boolean,
 *           onProgress?: (done:number,total:number,phase:string)=>void,
 *           requestPassword?: (wasWrong:boolean)=>string|null }} opts
 * @returns {Promise<{ blob: Blob, pages: number, mode: string, notice?: string }>}
 */
export async function convertPdfToDocx(file, opts = {}) {
  const { mode = 'text', removeHeadersFooters = true, keepPageBreaks = false, onProgress, requestPassword } = opts;
  const pdfDoc = await openPdf(file, requestPassword);
  const title = file.name.replace(/\.pdf$/i, '');

  try {
    let notice;
    let useMode = mode;
    let analysis = null;
    let pages = null;

    if (useMode === 'text') {
      pages = await extractPages(pdfDoc, { onProgress });
      analysis = analyzePages(pages, { removeHeadersFooters, keepPageBreaks });
      // Almost no text per page => scanned/image-only PDF.
      if (analysis.charCount < 25 * pdfDoc.numPages) {
        useMode = 'snapshot';
        notice = 'No selectable text was found (likely a scanned PDF), so each page was embedded as an image instead. The text is not editable.';
      }
    }

    let doc;
    if (useMode === 'text') {
      doc = buildEditableDocument(analysis, pages[0], { title, keepPageBreaks });
    } else {
      const snaps = await renderSnapshots(pdfDoc, onProgress);
      doc = buildSnapshotDocument(snaps, { title });
    }
    const blob = await Packer.toBlob(doc);
    return { blob, pages: pdfDoc.numPages, mode: useMode, notice };
  } finally {
    pdfDoc.destroy();
  }
}
