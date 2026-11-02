import { useEffect, useRef, useState } from 'react';

// Documentasheion: one filled-in Attendance Data Template in, the four HR
// import files out (Attendance On Day, Attendance Per Day, Overtime Request,
// Shift Schedule). Everything runs in the browser — nothing is uploaded.

const MAX_WARNINGS_SHOWN = 200;

// Choices for a day that has only a time in or only a time out.
const PUNCH_OPTIONS = [
  { value: '', label: 'Leave as is' },
  { value: 'match', label: 'Match the shift' },
  { value: 'manual', label: 'Manual edit' },
];

// Choices in the review dialog (value '' = leave the day as it is).
const LEAVE_OPTIONS = [
  { value: '', label: '— none —' },
  { value: 'VL', label: 'VL · vacation leave' },
  { value: 'SL', label: 'SL · sick leave' },
  { value: 'HVL', label: 'HVL · half-day VL' },
  { value: 'HSL', label: 'HSL · half-day SL' },
  { value: 'LWOP', label: 'LWOP · leave without pay' },
];

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
  const [prepared, setPrepared] = useState(null); // sheet read + templates loaded
  const [review, setReview] = useState([]); // working days with a missing punch and no leave remark
  const [choices, setChoices] = useState({}); // sourceRow -> leave type picked in the dialog
  const [reviewPartial, setReviewPartial] = useState([]); // days with only a time in or only a time out
  const [fixes, setFixes] = useState({}); // sourceRow -> { mode: ''|'match'|'manual', timeIn, timeOut }
  const [stage, setStage] = useState(null); // which dialog is open: 'leave' | 'punch' | null
  const [fromResult, setFromResult] = useState(false); // dialog reopened from the results card
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
    setPrepared(null);
    setReview([]);
    setReviewPartial([]);
    setChoices({});
    setFixes({});
    setStage(null);
    setError('');
    setFile(f);
  }

  // Step 1: read the sheet. If some working days have a missing punch and no
  // leave remark, ask what they were before writing anything.
  async function generate() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    revokeAll();
    try {
      // Lazy: exceljs is large, only fetch it when a file is processed.
      const { prepareFromFile } = await import('../utils/documentasheion/index.js');
      const prep = await prepareFromFile(file, { onStatus: setStatus });
      setPrepared(prep);
      setReview(prep.review);
      setReviewPartial(prep.reviewPartial);
      setChoices({});
      setFixes({});
      setFromResult(false);
      if (prep.review.length > 0 || prep.reviewPartial.length > 0) {
        setStage(prep.review.length > 0 ? 'leave' : 'punch');
        setBusy(false);
        setStatus('');
      } else {
        await produce(prep, {}, {});
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not process that file.');
      setBusy(false);
      setStatus('');
    }
  }

  // Step 2: apply the leave choices and write the four files.
  async function produce(prep, picked, picks) {
    setBusy(true);
    setError('');
    revokeAll();
    try {
      const { finish, XLSX_MIME } = await import('../utils/documentasheion/index.js');
      const out = await finish(prep, picked, setStatus, picks);

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

  const leavePicks = (use) => (use ? Object.fromEntries(Object.entries(choices).filter(([, v]) => v)) : {});
  const punchPicks = (use) => (use
    ? Object.fromEntries(Object.entries(fixes).filter(([, v]) => v.mode).map(([k, v]) => [k, v]))
    : {});

  // "Leave all as is" / primary button of the first dialog.
  function finishLeave(use) {
    if (!use) setChoices({});
    if (!fromResult && reviewPartial.length > 0) {
      setStage('punch'); // on to the missing-punch dialog
      return;
    }
    setStage(null);
    produce(prepared, leavePicks(use), punchPicks(true));
  }

  function finishPunch(use) {
    if (!use) setFixes({});
    setStage(null);
    produce(prepared, leavePicks(true), punchPicks(use));
  }

  const setChoice = (rowNum, value) => setChoices((c) => ({ ...c, [rowNum]: value }));
  const setAll = (value) => setChoices(Object.fromEntries(review.map((d) => [d.rowNum, value])));
  const pickedCount = Object.values(choices).filter(Boolean).length;

  const setFix = (d, patch) => setFixes((f) => {
    const cur = f[d.rowNum] || { mode: '', timeIn: d.timeIn, timeOut: d.timeOut };
    return { ...f, [d.rowNum]: { ...cur, ...patch } };
  });
  const setAllFix = (mode) => setFixes(Object.fromEntries(reviewPartial.map((d) => [d.rowNum, { mode, timeIn: d.timeIn, timeOut: d.timeOut }])));
  const fixCount = Object.values(fixes).filter((v) => v.mode).length;

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
                <button className="btn ghost sm" onClick={() => { setFile(null); setResult(null); setPrepared(null); setReview([]); setReviewPartial([]); setChoices({}); setFixes({}); setStage(null); setError(''); revokeAll(); }} disabled={busy}>Remove</button>
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
            <div style={{ display: 'flex', gap: 6 }}>
              {review.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('leave'); }} disabled={busy}>
                  Review leave days ({review.length})
                </button>
              )}
              {reviewPartial.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('punch'); }} disabled={busy}>
                  Review missing punches ({reviewPartial.length})
                </button>
              )}
              <a className="btn sm" href={result.zipUrl} download={zipName}>Download all (.zip)</a>
            </div>
          </div>
          <div style={{ padding: '10px 18px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            {result.stats.employees} employee{result.stats.employees === 1 ? '' : 's'} · {result.stats.dayRows} day rows read
            {result.stats.sampleRows ? ` · ${result.stats.sampleRows} sample row${result.stats.sampleRows === 1 ? '' : 's'} skipped` : ''}
            {result.stats.punchFixed ? ` · ${result.stats.punchFixed} missing punch${result.stats.punchFixed === 1 ? '' : 'es'} fixed` : ''}
            {(() => {
              const l = Object.entries(result.stats.leave || {}).filter(([, n]) => n > 0);
              return l.length ? ` · leave days: ${l.map(([k, n]) => `${n} ${k}`).join(', ')}` : '';
            })()}
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
            <li><b>Remarks</b> — VL / SL: time in/out become the shift's own start/end. HVL / HSL (or HSV): the half not worked is filled from the shift; with no punches at all, only the first half (shift start to 12:00) is filled. LWOP: left as is.</li>
            <li><b>Attendance On Day</b> — days with a time in/out that stay on the same date, and whose overtime (if any) does too.</li>
            <li><b>Attendance Per Day</b> — shifts whose time out falls on the next date (out earlier than in); overtime is not considered.</li>
            <li><b>Overtime Request</b> — only days that have an approved overtime start and end; dates roll over midnight where needed. Reason code is left blank.</li>
            <li><b>Shift Schedule</b> — one row per employee, one column per date, using the Shift Schedule column as it is (OFF and LWOP included). Leave days keep the scheduled shift.</li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>Every cell is written as text; dates stay as MM/DD/YYYY and times as HH:MM.</p>
        </div>
      </div>
      {stage === 'leave' && (
        <div className="modal-backdrop" onClick={() => setStage(null)}>
          <div className="modal" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Days with no leave remark</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                These scheduled working days have no time in or out at all and no VL, SL, HVL, HSL or LWOP in Remarks.
                Pick what each one was — or leave it as “none” and it stays exactly as it is in the sheet.
              </p>
              <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0 }}>Set all to</label>
                <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value !== '' && setAll(e.target.value === '__none' ? '' : e.target.value)}>
                  <option value="">choose…</option>
                  {LEAVE_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value || '__none'}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      <th style={{ padding: '6px 8px' }}>Row</th>
                      <th style={{ padding: '6px 8px' }}>Employee</th>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }}>Shift</th>
                      <th style={{ padding: '6px 8px' }}>In</th>
                      <th style={{ padding: '6px 8px' }}>Out</th>
                      <th style={{ padding: '6px 8px' }}>Leave type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.map((d) => (
                      <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                        <td style={{ padding: '6px 8px' }}>{d.empNo}{d.name ? <span style={{ color: 'var(--ink3)' }}> · {d.name}</span> : null}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                        <td style={{ padding: '6px 8px' }}>{d.timeIn || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{d.timeOut || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <select className="field" style={{ width: 'auto' }} value={choices[d.rowNum] || ''} onChange={(e) => setChoice(d.rowNum, e.target.value)}>
                            {LEAVE_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => finishLeave(false)}>Leave all as is</button>
              <button className="btn" onClick={() => finishLeave(true)}>
                {!fromResult && reviewPartial.length > 0
                  ? (pickedCount ? `Apply ${pickedCount} & next` : 'Next')
                  : (pickedCount ? `Apply ${pickedCount} & generate` : 'Generate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stage === 'punch' && (
        <div className="modal-backdrop" onClick={() => setStage(null)}>
          <div className="modal" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Days with only one punch</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                These days have a time in or a time out but not both, and no leave remark. Match the shift fills only the blank
                time from the shift schedule; manual edit lets you type the times here. Anything left as is stays blank in the output.
              </p>
              <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0 }}>Set all to</label>
                <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setAllFix(e.target.value === '__none' ? '' : e.target.value)}>
                  <option value="">choose…</option>
                  <option value="__none">Leave as is</option>
                  <option value="match">Match the shift</option>
                </select>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      <th style={{ padding: '6px 8px' }}>Row</th>
                      <th style={{ padding: '6px 8px' }}>Employee</th>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }}>Shift</th>
                      <th style={{ padding: '6px 8px' }}>In</th>
                      <th style={{ padding: '6px 8px' }}>Out</th>
                      <th style={{ padding: '6px 8px' }}>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewPartial.map((d) => {
                      const fx = fixes[d.rowNum] || { mode: '', timeIn: d.timeIn, timeOut: d.timeOut };
                      const cell = (which, existing, matched) => {
                        if (fx.mode === 'manual') {
                          return (
                            <input
                              className="field"
                              type="time"
                              style={{ width: 110 }}
                              value={which === 'in' ? fx.timeIn : fx.timeOut}
                              onChange={(e) => setFix(d, which === 'in' ? { timeIn: e.target.value } : { timeOut: e.target.value })}
                            />
                          );
                        }
                        if (existing) return existing;
                        if (fx.mode === 'match' && matched) return <span style={{ color: 'var(--teal)' }}>{matched}</span>;
                        return '—';
                      };
                      return (
                        <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                          <td style={{ padding: '6px 8px' }}>{d.empNo}{d.name ? <span style={{ color: 'var(--ink3)' }}> · {d.name}</span> : null}</td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                          <td style={{ padding: '6px 8px' }}>{cell('in', d.timeIn, d.matchIn)}</td>
                          <td style={{ padding: '6px 8px' }}>{cell('out', d.timeOut, d.matchOut)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <select className="field" style={{ width: 'auto' }} value={fx.mode} onChange={(e) => setFix(d, { mode: e.target.value })}>
                              {PUNCH_OPTIONS.map((o) => (
                                <option key={o.value || '__none'} value={o.value} disabled={o.value === 'match' && !d.canMatch}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => finishPunch(false)}>Leave all as is</button>
              <button className="btn" onClick={() => finishPunch(true)}>
                {fixCount ? `Apply ${fixCount} & generate` : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
