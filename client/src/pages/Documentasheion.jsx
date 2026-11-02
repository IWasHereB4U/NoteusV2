import { useEffect, useRef, useState } from 'react';

// Documentasheion: one filled-in Attendance Data Template in, the four HR
// import files out (Attendance On Day, Attendance Per Day, Overtime Request,
// Shift Schedule). Everything runs in the browser — nothing is uploaded.

const MAX_WARNINGS_SHOWN = 200;

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Documentasheion() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { files, stats, warnings, zipUrl }
  const inputRef = useRef(null);
  const urlsRef = useRef([]);

  function revokeAll() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }
  useEffect(() => revokeAll, []);

  function pick(fileList) {
    const f = [...fileList].find((x) => /\.xlsx$/i.test(x.name));
    if (!f) {
      alert('Please choose an .xlsx file (the filled-in Attendance Data Template).');
      return;
    }
    revokeAll();
    setResult(null);
    setError('');
    setFile(f);
  }

  async function generate() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    revokeAll();
    try {
      // Lazy: exceljs is large, only fetch it when a file is processed.
      const { generateFromFile, XLSX_MIME } = await import('../utils/documentasheion/index.js');
      const out = await generateFromFile(file, { onStatus: setStatus });

      setStatus('Packing downloads…');
      const files = out.files.map((f) => {
        const blob = new Blob([f.buffer], { type: XLSX_MIME });
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        return { ...f, blob, url, size: blob.size };
      });

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f.blob));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      urlsRef.current.push(zipUrl);

      setResult({ files, stats: out.stats, warnings: out.warnings, zipUrl });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not process that file.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  const zipName = file ? `${file.name.replace(/\.[^.]+$/, '')}_import-files.zip` : 'import-files.zip';

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Utilities</div><h1>Documentasheion</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h2>Attendance data</h2>
          <span className="tag green">Excel → 4 import files</span>
        </div>
        <div className="card-b">
          <div
            className={`dropzone${dragging ? ' over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          >
            <b>Drop the filled-in Attendance Data Template here</b>
            <span>or click to choose an .xlsx · processed in your browser, the file is never uploaded</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
            />
          </div>

          {file && (
            <div className="conv-row" style={{ padding: '14px 0 0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtSize(file.size)} · ready</div>
              </div>
              <span className="tag ochre">{busy ? 'working' : 'queued'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost sm" onClick={() => { setFile(null); setResult(null); setError(''); revokeAll(); }} disabled={busy}>Remove</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={generate} disabled={!file || busy}>
              {busy ? 'Generating…' : 'Generate the 4 files'}
            </button>
            {busy && status && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{status}</span>}
          </div>
          {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--coral)' }}>{error}</div>}
        </div>
      </div>

      {result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h2>Generated files</h2>
            <a className="btn sm" href={result.zipUrl} download={zipName}>Download all (.zip)</a>
          </div>
          <div style={{ padding: '10px 18px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            {result.stats.employees} employee{result.stats.employees === 1 ? '' : 's'} · {result.stats.dayRows} day rows read
            {result.stats.sampleRows ? ` · ${result.stats.sampleRows} sample row${result.stats.sampleRows === 1 ? '' : 's'} skipped` : ''}
          </div>
          <div className="stack">
            {result.files.map((f) => (
              <div key={f.id} className="conv-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {f.name} · {f.id === 'schedule'
                      ? `${f.rows} employee${f.rows === 1 ? '' : 's'} × ${result.stats.scheduleDates} dates`
                      : `${f.rows} row${f.rows === 1 ? '' : 's'}`} · {fmtSize(f.size)}
                  </div>
                </div>
                <span className={`tag ${f.rows > 0 ? 'green' : 'ochre'}`}>{f.rows > 0 ? 'filled' : 'empty'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a className="btn sm" href={f.url} download={f.name}>Download</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && result.warnings.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h2>Worth a look</h2>
            <span className="tag ochre">{result.warnings.length} note{result.warnings.length === 1 ? '' : 's'}</span>
          </div>
          <div className="stack">
            {result.warnings.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => (
              <div key={i} className="conv-row" style={{ gridTemplateColumns: '64px 1fr', padding: '8px 18px', fontSize: 13 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>{w.row ? `Row ${w.row}` : 'General'}</span>
                <span>{w.message}</span>
              </div>
            ))}
            {result.warnings.length > MAX_WARNINGS_SHOWN && (
              <div style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--ink3)' }}>
                …and {result.warnings.length - MAX_WARNINGS_SHOWN} more.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h"><h2>How the sheet is read</h2></div>
        <div className="card-b" style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            Row 1 is the column header and the sample rows before the first employee are ignored. An employee starts at a
            header row (just the name filled in), followed by their timesheet; an empty row ends it, and the next header starts
            the next employee. Empty rows are skipped.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Attendance On Day</b> — days with a time in/out that stay on the same date, and whose overtime (if any) does too.</li>
            <li><b>Attendance Per Day</b> — shifts whose time out falls on the next date (out earlier than in); overtime is not considered.</li>
            <li><b>Overtime Request</b> — only days that have an approved overtime start and end; dates roll over midnight where needed. Reason code is left blank.</li>
            <li><b>Shift Schedule</b> — one row per employee, one column per date, using the Shift Schedule column as it is (OFF and LWOP included). VL, SL, Half VL and Half SL keep the scheduled shift.</li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>Every cell is written as text; dates stay as MM/DD/YYYY and times as HH:MM.</p>
        </div>
      </div>
    </main>
  );
}
