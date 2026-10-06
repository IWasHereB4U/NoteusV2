import { useEffect, useRef, useState } from 'react';

// Add future conversions here (e.g. DOCX -> PDF); the page renders a chip per
// entry and routes files to the matching `run`.
const CONVERSIONS = [
  {
    id: 'pdf-docx',
    label: 'PDF → Word',
    accept: '.pdf,application/pdf',
    test: (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf',
    outExt: 'docx',
    run: async (file, opts) => {
      // Lazy: pdfjs + docx are large, only fetch them when a file is converted.
      const { convertPdfToDocx } = await import('../utils/pdfConvert/index.js');
      return convertPdfToDocx(file, opts);
    },
  },
];

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let nextId = 1;

export function Converter() {
  const [conversion] = useState(CONVERSIONS[0]);
  const [jobs, setJobs] = useState([]);
  const [mode, setMode] = useState('text');
  const [removeHF, setRemoveHF] = useState(true);
  const [keepBreaks, setKeepBreaks] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const urlsRef = useRef(new Set());

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const patch = (id, changes) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...changes } : j)));

  function addFiles(fileList) {
    const files = [...fileList];
    const ok = files.filter(conversion.test);
    const rejected = files.length - ok.length;
    if (ok.length) {
      setJobs((js) => [...js, ...ok.map((file) => ({ id: nextId++, file, status: 'queued', progress: 0 }))]);
    }
    if (rejected) alert(`${rejected} file${rejected > 1 ? 's were' : ' was'} skipped — only PDF files can be converted here.`);
  }

  async function convertAll() {
    if (busy) return;
    setBusy(true);
    const queue = jobs.filter((j) => j.status === 'queued' || j.status === 'error');
    for (const job of queue) {
      patch(job.id, { status: 'working', progress: 0, error: null, notice: null });
      try {
        const res = await conversion.run(job.file, {
          mode,
          removeHeadersFooters: removeHF,
          keepPageBreaks: keepBreaks,
          onProgress: (done, total) => patch(job.id, { progress: Math.round((done / total) * 100) }),
          requestPassword: (wasWrong) =>
            window.prompt(wasWrong ? 'Wrong password — try again:' : `"${job.file.name}" is password-protected. Enter the password:`),
        });
        const url = URL.createObjectURL(res.blob);
        urlsRef.current.add(url);
        patch(job.id, {
          status: 'done',
          progress: 100,
          url,
          pages: res.pages,
          size: res.blob.size,
          usedMode: res.mode,
          notice: res.notice,
          outName: job.file.name.replace(/\.[^.]+$/, '') + '.' + conversion.outExt,
        });
      } catch (err) {
        console.error(err);
        patch(job.id, { status: 'error', error: err.message || 'Conversion failed' });
      }
    }
    setBusy(false);
  }

  function remove(job) {
    if (job.url) {
      URL.revokeObjectURL(job.url);
      urlsRef.current.delete(job.url);
    }
    setJobs((js) => js.filter((j) => j.id !== job.id));
  }

  const pending = jobs.filter((j) => j.status === 'queued' || j.status === 'error').length;

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Utilities</div><h1>File converter</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h2>Conversion</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {CONVERSIONS.map((c) => (
              <span key={c.id} className={`tag ${c.id === conversion.id ? 'green' : ''}`}>{c.label}</span>
            ))}
          </div>
        </div>
        <div className="card-b">
          <div
            className={`dropzone${dragging ? ' over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          >
            <b>Drop PDF files here</b>
            <span>or click to choose · converted in your browser, files are never uploaded</span>
            <input
              ref={inputRef}
              type="file"
              accept={conversion.accept}
              multiple
              hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          <div className="field-row" style={{ marginTop: 16 }}>
            <label>Output</label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={mode === 'text'} onChange={() => setMode('text')} />
              <span><b>Editable text</b> — rebuilds headings, paragraphs, bullets and simple tables. Best for PDFs made from documents.</span>
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={mode === 'snapshot'} onChange={() => setMode('snapshot')} />
              <span><b>Page snapshots</b> — each page as an image, looks identical but isn't editable. Use for scans, forms or complex layouts.</span>
            </label>
          </div>

          {mode === 'text' && (
            <div className="field-row">
              <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={removeHF} onChange={(e) => setRemoveHF(e.target.checked)} />
                Remove repeating headers, footers and page numbers
              </label>
              <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={keepBreaks} onChange={(e) => setKeepBreaks(e.target.checked)} />
                Start a new page wherever the PDF does
              </label>
            </div>
          )}

          <button className="btn" onClick={convertAll} disabled={busy || pending === 0}>
            {busy ? 'Converting…' : pending > 1 ? `Convert ${pending} files` : 'Convert'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Files</h2></div>
        {jobs.length === 0 ? (
          <div className="empty"><b>No files yet</b>Add a PDF above to get started.</div>
        ) : (
          <div className="stack">
            {jobs.map((job) => (
              <div key={job.id} className="conv-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.file.name}</div>
                  <div style={{ fontSize: 12, color: job.status === 'error' ? 'var(--coral)' : 'var(--ink3)' }}>
                    {job.status === 'queued' && `${fmtSize(job.file.size)} · ready`}
                    {job.status === 'working' && `Converting… ${job.progress}%`}
                    {job.status === 'done' && `${job.pages} page${job.pages > 1 ? 's' : ''} · ${fmtSize(job.size)} · ${job.usedMode === 'text' ? 'editable text' : 'page snapshots'}`}
                    {job.status === 'error' && job.error}
                  </div>
                  {job.notice && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2 }}>{job.notice}</div>}
                </div>
                <span className={`tag ${job.status === 'done' ? 'green' : job.status === 'error' ? 'rose' : 'ochre'}`}>
                  {job.status === 'working' ? 'working' : job.status}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {job.status === 'done' && (
                    <a className="btn sm" href={job.url} download={job.outName}>Download</a>
                  )}
                  <button className="btn ghost sm" onClick={() => remove(job)} disabled={job.status === 'working'}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
