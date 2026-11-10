import { useEffect, useRef, useState } from 'react';

// Documentasheion: one filled-in Attendance Data Template in, the four HR
// import files out (Attendance On Day, Attendance Next Day, Overtime Request,
// Shift Schedule). Everything runs in the browser — nothing is uploaded.

const MAX_WARNINGS_SHOWN = 200;

// One list of choices for every day that needs a decision (no punches, or only
// one punch, and no leave in Remarks). It could be any leave type, or the times
// may just need fixing — so both dialogs offer all of these.
// value '' = leave the day as it is.
const ACTION_OPTIONS = [
  { value: '', label: '— leave as is —' },
  { value: 'VL', label: 'VL · vacation leave' },
  { value: 'SL', label: 'SL · sick leave' },
  { value: 'HVL', label: 'HVL · half-day VL' },
  { value: 'HSL', label: 'HSL · half-day SL' },
  { value: 'LWOP', label: 'LWOP · leave without pay' },
  { value: 'match', label: 'Match the shift' },
  { value: 'manual', label: 'Manual edit' },
];
// Remark rows usually have both punches already, so "Match the shift" has nothing to fill.
const REMARK_OPTIONS = ACTION_OPTIONS.filter((o) => o.value !== 'match');
const LEAVE_VALUES = ['VL', 'SL', 'HVL', 'HSL', 'LWOP'];

// Order of the dialogs. 'holidays' comes first, the three overtime ones last.
const ORDER = ['holidays', 'leave', 'punch', 'remark', 'holidayOt', 'otMismatch', 'holidayMismatch'];
const OT_STAGES = ['holidayOt', 'otMismatch', 'holidayMismatch'];
const NO_OT = { reviewHolidayOt: [], reviewOtMismatch: [], reviewHolidayMismatch: [] };

// Holiday with attendance and no OT in the sheet: skip is the default.
const HOLIDAY_OT_OPTIONS = [
  { value: '', label: 'Skip (no OT)' },
  { value: 'match', label: 'Match OT' },
  { value: 'manual', label: 'Manual edit' },
];
// OT that the attendance does not cover (normal day or holiday): keeping it is the default.
const MISMATCH_OPTIONS = [
  { value: '', label: 'Keep as is' },
  { value: 'trim', label: 'Trim OT to attendance' },
  { value: 'remove', label: 'Remove this OT' },
  { value: 'manual', label: 'Manual edit' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fmtDay = (ms) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

// Month calendar: only dates that exist in the sheet can be picked. Dates are
// UTC-midnight milliseconds, same as the parser uses, so no time zone shifts a day.
function HolidayCalendar({ dates, selected, onToggle }) {
  const inSheet = new Set(dates);
  const first = dates.length ? new Date(Math.min(...dates)) : new Date();
  const [view, setView] = useState({ y: first.getUTCFullYear(), m: first.getUTCMonth() });
  const startDow = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => Date.UTC(view.y, view.m, i + 1))];
  const move = (n) => setView((v) => {
    const t = new Date(Date.UTC(v.y, v.m + n, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  });
  const sel = new Set(selected);

  return (
    <div style={{ maxWidth: 340, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn ghost sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b>{MONTHS[view.m]} {view.y}</b>
        <button className="btn ghost sm" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 11, color: 'var(--ink3)', padding: '4px 0' }}>{w}</div>)}
        {cells.map((ms, i) => {
          if (ms === null) return <div key={`b${i}`} />;
          const usable = inSheet.has(ms);
          const on = sel.has(ms);
          return (
            <button
              key={ms}
              disabled={!usable}
              onClick={() => onToggle(ms)}
              aria-pressed={on}
              title={usable ? fmtDay(ms) : 'Not in the sheet'}
              style={{
                padding: '8px 0', borderRadius: 8, fontSize: 13, cursor: usable ? 'pointer' : 'default',
                border: `1px solid ${on ? 'var(--teal)' : usable ? 'var(--line)' : 'transparent'}`,
                background: on ? 'var(--teal)' : 'transparent',
                color: on ? '#fff' : usable ? 'inherit' : 'var(--ink3)',
                opacity: usable ? 1 : 0.4,
              }}
            >
              {new Date(ms).getUTCDate()}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, textAlign: 'center' }}>
        Only dates that are in the sheet can be picked. Click a date again to unpick it.
      </div>
    </div>
  );
}

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
  const [reviewRemark, setReviewRemark] = useState([]); // days whose remark is not a leave code
  const [stage, setStage] = useState(null); // which dialog is open: 'leave' | 'punch' | 'remark' | null
  const [holidays, setHolidays] = useState([]); // holiday dates picked on the calendar (UTC ms)
  const [otLists, setOtLists] = useState(NO_OT); // days that need an overtime decision
  const [otFixes, setOtFixes] = useState({}); // sourceRow -> { mode, otStart, otEnd }
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
    setReviewRemark([]);
    setChoices({});
    setFixes({});
    setHolidays([]);
    setOtLists(NO_OT);
    setOtFixes({});
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
      setReviewRemark(prep.reviewRemark);
      setChoices({});
      setFixes({});
      setHolidays([]);
      setOtLists(NO_OT);
      setOtFixes({});
      setFromResult(false);
      setBusy(false);
      setStatus('');
      if (prep.dates.length > 0) {
        setStage('holidays'); // first question: which of these dates are holidays?
      } else {
        await advance('holidays', { prep, hol: [], of: {}, ch: {}, fx: {}, lists: { review: prep.review, reviewPartial: prep.reviewPartial, reviewRemark: prep.reviewRemark } });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not process that file.');
      setBusy(false);
      setStatus('');
    }
  }

  // Step 2: apply the leave choices and write the four files.
  async function produce(prep, picked, picks, hol = holidays, of = otFixes) {
    setBusy(true);
    setError('');
    revokeAll();
    try {
      const { finish, XLSX_MIME } = await import('../utils/documentasheion/index.js');
      const out = await finish(prep, picked, setStatus, picks, hol, of);

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
      setOtLists({ reviewHolidayOt: out.reviewHolidayOt, reviewOtMismatch: out.reviewOtMismatch, reviewHolidayMismatch: out.reviewHolidayMismatch });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not process that file.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  // One decision per row, shared by both dialogs: a leave type goes to `choices`,
  // match / manual goes to `fixes`. Picking one clears the other.
  const actionOf = (d) => choices[d.rowNum] || fixes[d.rowNum]?.mode || '';
  const setAction = (d, value) => {
    const isLeave = LEAVE_VALUES.includes(value);
    setChoices((c) => {
      const n = { ...c };
      if (isLeave) n[d.rowNum] = value; else delete n[d.rowNum];
      return n;
    });
    setFixes((f) => {
      const n = { ...f };
      if (value === 'match' || value === 'manual') {
        const cur = f[d.rowNum] || { timeIn: d.timeIn, timeOut: d.timeOut };
        n[d.rowNum] = { ...cur, mode: value };
      } else delete n[d.rowNum];
      return n;
    });
  };
  const setAllAction = (rows, value) => rows.forEach((d) => setAction(d, value));
  const setTime = (d, patch) => setFixes((f) => {
    const cur = f[d.rowNum] || { mode: 'manual', timeIn: d.timeIn, timeOut: d.timeOut };
    return { ...f, [d.rowNum]: { ...cur, ...patch } };
  });
  const countFor = (rows) => rows.filter((d) => actionOf(d)).length;

  // Drop every decision for the given rows ("Leave all as is").
  function clearFor(rows) {
    const ids = new Set(rows.map((d) => d.rowNum));
    setChoices((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !ids.has(+k))));
    setFixes((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !ids.has(+k))));
    return ids;
  }
  const without = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.has(+k)));

  const keep = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => (typeof v === 'string' ? v : v.mode)));

  // Move on from the dialog `from` to the next one that has something to ask,
  // or write the files when there is none. `ctx` carries decisions that were
  // only just made (state has not caught up yet).
  async function advance(from, ctx = {}) {
    const { analyze } = await import('../utils/documentasheion/index.js');
    const prep = ctx.prep || prepared;
    const ch = ctx.ch ?? choices;
    const fx = ctx.fx ?? fixes;
    const hol = ctx.hol ?? holidays;
    const of = ctx.of ?? otFixes;
    const L = ctx.lists || { review, reviewPartial, reviewRemark };
    const overrides = keep(ch);
    const punchFixes = keep(fx);
    // Reopened from the results card: just write the files again.
    // (Changing the holidays has to go on to the overtime dialogs, though.)
    const goOn = !fromResult || from === 'holidays';
    let ot = null;
    if (goOn) {
      let i = ORDER.indexOf(from) + 1;
      if (fromResult) i = ORDER.indexOf('holidayOt');
      for (; i < ORDER.length; i += 1) {
        const st = ORDER[i];
        let items;
        if (OT_STAGES.includes(st)) {
          // Overtime depends on the punches / leave decided above, so look again now.
          if (!ot) {
            ot = analyze(prep, { overrides, punchFixes, holidays: hol, otFixes: of });
            setOtLists(ot);
          }
          items = st === 'holidayOt' ? ot.reviewHolidayOt : st === 'otMismatch' ? ot.reviewOtMismatch : ot.reviewHolidayMismatch;
        } else {
          items = st === 'leave' ? L.review : st === 'punch' ? L.reviewPartial : L.reviewRemark;
        }
        if (items.length > 0) {
          setStage(st);
          return;
        }
      }
    }
    setStage(null);
    await produce(prep, overrides, punchFixes, hol, of);
  }

  function finishHolidays(clear) {
    const hol = clear ? [] : holidays;
    if (clear) setHolidays([]);
    advance('holidays', { hol });
  }

  // Button of the first dialog (no punches at all).
  function finishLeave(use) {
    let ch = choices;
    let fx = fixes;
    if (!use) {
      const ids = clearFor(review);
      ch = without(choices, ids);
      fx = without(fixes, ids);
    }
    advance('leave', { ch, fx });
  }

  // Button of the second dialog (only one punch).
  function finishPunch(use) {
    let ch = choices;
    let fx = fixes;
    if (!use) {
      const ids = clearFor(reviewPartial);
      ch = without(choices, ids);
      fx = without(fixes, ids);
    }
    advance('punch', { ch, fx });
  }

  // Button of the third dialog (remark that is not a leave code).
  function finishRemark(use) {
    let ch = choices;
    let fx = fixes;
    if (!use) {
      const ids = clearFor(reviewRemark);
      ch = without(choices, ids);
      fx = without(fixes, ids);
    }
    advance('remark', { ch, fx });
  }

  // ---- overtime dialogs (holiday with attendance / OT not covered / holiday OT not covered)
  const otModeOf = (d) => otFixes[d.rowNum]?.mode || '';
  const setOtAction = (d, value) => setOtFixes((f) => {
    const n = { ...f };
    if (!value) delete n[d.rowNum];
    else {
      const cur = f[d.rowNum] || {};
      n[d.rowNum] = { otStart: d.otStart || d.matchStart || '', otEnd: d.otEnd || d.matchEnd || '', ...cur, mode: value };
    }
    return n;
  });
  const setAllOtAction = (rows, value) => rows.forEach((d) => { if (!(value === 'trim' && !d.canTrim)) setOtAction(d, value); });
  const setOtTime = (d, patch) => setOtFixes((f) => ({
    ...f,
    [d.rowNum]: { otStart: d.otStart || d.matchStart || '', otEnd: d.otEnd || d.matchEnd || '', mode: 'manual', ...f[d.rowNum], ...patch },
  }));
  const otCount = (rows) => rows.filter((d) => otModeOf(d)).length;

  function finishOt(stageName, rows, use) {
    let of = otFixes;
    if (!use) {
      const ids = new Set(rows.map((d) => d.rowNum));
      of = Object.fromEntries(Object.entries(otFixes).filter(([k]) => !ids.has(+k)));
      setOtFixes(of);
    }
    advance(stageName, { of });
  }

  const { reviewHolidayOt, reviewOtMismatch, reviewHolidayMismatch } = otLists;
  // Does a dialog come after this one? (decides "Next" vs "Generate")
  const nextAfter = {
    holidayOt: reviewOtMismatch.length > 0 || reviewHolidayMismatch.length > 0,
    otMismatch: reviewHolidayMismatch.length > 0,
    holidayMismatch: false,
  };

  // One of the three overtime dialogs.
  function renderOtDialog(stageName, cfg) {
    const { title, intro, rows, options, ids, listName, maxWidth } = cfg;
    const count = otCount(rows);
    const more = !fromResult && nextAfter[stageName];
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-h">
            <h3>{title}</h3>
            <button onClick={() => setStage(null)} aria-label="Close">×</button>
          </div>
          <div className="modal-b">
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>{intro}</p>
            <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <label style={{ margin: 0 }}>Set all to</label>
              <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setAllOtAction(rows, e.target.value === '__none' ? '' : e.target.value)}>
                <option value="">choose…</option>
                {options.map((o) => <option key={o.value || '__none'} value={o.value || '__none'}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {['Row', 'Employee', 'Date', 'Shift', 'In', 'Out', ids === 'holidayOt' ? 'Match would be' : 'Approved OT', ids === 'holidayOt' ? '' : 'Difference', 'What to do'].map((h, i) => (
                      h === '' ? null : <th key={i} style={{ padding: '6px 8px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const mode = otModeOf(d);
                    const fx = otFixes[d.rowNum];
                    return (
                      <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)', verticalAlign: 'top' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                        <td style={{ padding: '6px 8px' }}>{d.empNo}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                        <td style={{ padding: '6px 8px' }}>{d.timeIn || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{d.timeOut || '—'}</td>
                        {ids === 'holidayOt' ? (
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                            {d.matchStart}–{d.matchEnd}
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>from {d.matchSource}</div>
                          </td>
                        ) : (
                          <>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.otStart}–{d.otEnd}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--coral)', minWidth: 200 }}>
                              {d.diff}
                              {mode === 'trim' && d.canTrim && <div style={{ color: 'var(--teal)', fontSize: 12 }}>→ OT becomes {d.trimText}</div>}
                              {mode === 'remove' && <div style={{ color: 'var(--ink3)', fontSize: 12 }}>→ OT removed</div>}
                            </td>
                          </>
                        )}
                        <td style={{ padding: '6px 8px' }}>
                          <select className="field" style={{ width: 'auto' }} value={mode} onChange={(e) => setOtAction(d, e.target.value)}>
                            {options.map((o) => (
                              <option key={o.value || '__none'} value={o.value} disabled={o.value === 'trim' && !d.canTrim}>{o.label}</option>
                            ))}
                          </select>
                          {mode === 'manual' && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                              <input className="field" type="time" style={{ width: 105 }} value={fx?.otStart || ''} onChange={(e) => setOtTime(d, { otStart: e.target.value })} aria-label="OT start" />
                              <span>–</span>
                              <input className="field" type="time" style={{ width: 105 }} value={fx?.otEnd || ''} onChange={(e) => setOtTime(d, { otEnd: e.target.value })} aria-label="OT end" />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-f">
            <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => downloadList(rows, listName)}>Download list (.xlsx)</button>
            <button className="btn ghost" onClick={() => finishOt(stageName, rows, false)}>{cfg.skipAll}</button>
            <button className="btn" onClick={() => finishOt(stageName, rows, true)}>
              {more ? (count ? `Apply ${count} & next` : 'Next') : (count ? `Apply ${count} & generate` : 'Generate')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pickedCount = countFor(review);
  const fixCount = countFor(reviewPartial);
  const remarkCount = countFor(reviewRemark);

  // Download the list shown in a dialog as an Excel file.
  async function downloadList(rows, name) {
    try {
      const { buildReviewList, XLSX_MIME } = await import('../utils/documentasheion/index.js');
      const label = (d) => ACTION_OPTIONS.find((o) => o.value === actionOf(d))?.label?.replace(/^— | —$/g, '') || '';
      const buf = await buildReviewList(rows, label);
      const url = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(file?.name || 'attendance').replace(/\.[^.]+$/, '')}_${name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not build the list.');
    }
  }

  // In / Out cell: editable when Manual edit is picked, preview when Match is picked.
  const timeCell = (d, which) => {
    const fx = fixes[d.rowNum];
    const existing = which === 'in' ? d.timeIn : d.timeOut;
    const matched = which === 'in' ? d.matchIn : d.matchOut;
    if (fx?.mode === 'manual') {
      return (
        <input
          className="field"
          type="time"
          style={{ width: 110 }}
          value={which === 'in' ? fx.timeIn : fx.timeOut}
          onChange={(e) => setTime(d, which === 'in' ? { timeIn: e.target.value } : { timeOut: e.target.value })}
        />
      );
    }
    if (existing) return existing;
    if (fx?.mode === 'match' && matched) return <span style={{ color: 'var(--teal)' }}>{matched}</span>;
    return '—';
  };

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
                <button className="btn ghost sm" onClick={() => { setFile(null); setResult(null); setPrepared(null); setReview([]); setReviewPartial([]); setReviewRemark([]); setChoices({}); setFixes({}); setHolidays([]); setOtLists(NO_OT); setOtFixes({}); setStage(null); setError(''); revokeAll(); }} disabled={busy}>Remove</button>
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
              {reviewRemark.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('remark'); }} disabled={busy}>
                  Review remarks ({reviewRemark.length})
                </button>
              )}
              {prepared?.dates?.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('holidays'); }} disabled={busy}>
                  Holidays ({holidays.length})
                </button>
              )}
              {reviewHolidayOt.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('holidayOt'); }} disabled={busy}>
                  Review holiday attendance ({reviewHolidayOt.length})
                </button>
              )}
              {reviewOtMismatch.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('otMismatch'); }} disabled={busy}>
                  Review OT mismatches ({reviewOtMismatch.length})
                </button>
              )}
              {reviewHolidayMismatch.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setFromResult(true); setStage('holidayMismatch'); }} disabled={busy}>
                  Review holiday OT ({reviewHolidayMismatch.length})
                </button>
              )}
              <a className="btn sm" href={result.zipUrl} download={zipName}>Download all (.zip)</a>
            </div>
          </div>
          <div style={{ padding: '10px 18px 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            {result.stats.employees} employee{result.stats.employees === 1 ? '' : 's'} · {result.stats.dayRows} day rows read
            {result.stats.sampleRows ? ` · ${result.stats.sampleRows} sample row${result.stats.sampleRows === 1 ? '' : 's'} skipped` : ''}
            {result.stats.punchFixed ? ` · ${result.stats.punchFixed} missing punch${result.stats.punchFixed === 1 ? '' : 'es'} fixed` : ''}
            {result.stats.onePunchSkipped ? ` · ${result.stats.onePunchSkipped} one-punch day${result.stats.onePunchSkipped === 1 ? '' : 's'} left out` : ''}
            {result.stats.offDayOt ? ` · ${result.stats.offDayOt} OFF-day attendance → overtime` : ''}
            {result.stats.holidays ? ` · ${result.stats.holidays} holiday${result.stats.holidays === 1 ? '' : 's'}` : ''}
            {result.stats.holidayOtAdded ? ` · ${result.stats.holidayOtAdded} holiday OT added` : ''}
            {result.stats.otEdited ? ` · ${result.stats.otEdited} OT edited / removed` : ''}
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
            Row 1 is the column header and the template's sample rows (Emp_No GD_001) are ignored. Each employee's timesheet
            is a group of rows with their Emp_No on every row; an empty row ends it and the next group is the next employee.
            Empty rows are skipped.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Remarks</b> — VL / SL: time in/out become the shift's own start/end. HVL / HSL (or HSV): the half not worked is filled from the shift; with no punches at all, only the first half (shift start to 12:00) is filled. LWOP: left as is.</li>
            <li><b>One punch only</b> — a day with only a time in or only a time out (after the dialog) is incomplete, so it is left out of every attendance and overtime file. Fix it in the dialog (leave type, match the shift, manual edit) to include it.</li>
            <li><b>Attendance On Day</b> — days with a time in/out that stay on the same date, and whose overtime (if any) does too.</li>
            <li><b>Attendance Next Day</b> — shifts whose time out falls on the next date (out earlier than in); overtime is not considered.</li>
            <li><b>Overtime Request</b> — days that have an approved overtime start and end, plus any day whose shift is OFF but has attendance (time in/out become the overtime start/end); dates roll over midnight where needed. Reason code is left blank.</li>
            <li><b>Holidays</b> — after the sheet is read you pick the holiday dates on a calendar. A holiday where the employee has attendance but no approved OT is asked about: Match OT (OT = the whole shift; for an OFF shift, the time in/out), Manual edit, or Skip (the default, no OT).</li>
            <li><b>OT must be covered by the attendance</b> — on every day with approved OT (holiday or not), time in must be at or before the OT start and time out at or after the OT end. Anything else is flagged with the difference in time; the options are Keep as is (default), Trim OT to the attendance, Remove this OT, or Manual edit. No grace time.</li>
            <li><b>Shift Schedule</b> — one row per employee, one column per date, using the Shift Schedule column as it is (OFF and LWOP included). Leave days keep the scheduled shift.</li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>Every cell is written as text; dates stay as MM/DD/YYYY and times as HH:MM.</p>
        </div>
      </div>
      {stage === 'holidays' && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Which dates are holidays?</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                Pick the holidays on the calendar. On a holiday, anyone with attendance gets overtime, and that overtime
                has to match the attendance. Leave it empty if there are none.
              </p>
              <HolidayCalendar
                dates={prepared?.dates || []}
                selected={holidays}
                onToggle={(ms) => setHolidays((h) => (h.includes(ms) ? h.filter((x) => x !== ms) : [...h, ms].sort((a, b) => a - b)))}
              />
              {holidays.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {holidays.map((ms) => (
                    <span key={ms} className="tag green" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {fmtDay(ms)}
                      <button
                        onClick={() => setHolidays((h) => h.filter((x) => x !== ms))}
                        aria-label={`Remove ${fmtDay(ms)}`}
                        style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'inherit' }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => finishHolidays(true)}>No holidays</button>
              <button className="btn" onClick={() => finishHolidays(false)} disabled={holidays.length === 0}>
                {holidays.length ? `Use ${holidays.length} holiday${holidays.length === 1 ? '' : 's'}` : 'Pick a date'}
              </button>
            </div>
          </div>
        </div>
      )}
      {stage === 'holidayOt' && renderOtDialog('holidayOt', {
        title: 'Holiday with attendance',
        intro: 'These employees have a time in and out on a holiday but no approved overtime. Match OT sets the overtime to the whole shift (for an OFF shift, to the time in / out); Manual edit lets you type it. Skip, the default, adds no overtime.',
        rows: reviewHolidayOt, options: HOLIDAY_OT_OPTIONS, ids: 'holidayOt', listName: 'holiday-attendance', maxWidth: 940, skipAll: 'Skip all',
      })}
      {stage === 'otMismatch' && renderOtDialog('otMismatch', {
        title: 'Overtime not covered by attendance',
        intro: 'Time in must be at or before the OT start, and time out at or after the OT end. These days are not, so the approved overtime goes beyond what the employee actually worked (the difference is shown). Keep as is leaves the sheet\'s OT in the file.',
        rows: reviewOtMismatch, options: MISMATCH_OPTIONS, ids: 'otMismatch', listName: 'ot-mismatch', maxWidth: 1040, skipAll: 'Keep all as is',
      })}
      {stage === 'holidayMismatch' && renderOtDialog('holidayMismatch', {
        title: 'Holiday overtime not covered by attendance',
        intro: 'These holiday overtimes do not fit the attendance: time in must be at or before the OT start, and time out at or after the OT end. The difference is shown. Keep as is leaves the sheet\'s OT in the file.',
        rows: reviewHolidayMismatch, options: MISMATCH_OPTIONS, ids: 'holidayMismatch', listName: 'holiday-ot-mismatch', maxWidth: 1040, skipAll: 'Keep all as is',
      })}
      {stage === 'leave' && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Days with no leave remark</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                These scheduled working days have no time in or out at all and no VL, SL, HVL, HSL or LWOP in Remarks.
                It could be any of those leave types, or the times may need filling — pick what each one was (Match the shift
                or Manual edit fill the times instead). Anything left as is stays exactly as it is in the sheet.
              </p>
              <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0 }}>Set all to</label>
                <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value !== '' && setAllAction(review.filter((d) => e.target.value !== 'match' || d.canMatch), e.target.value === '__none' ? '' : e.target.value)}>
                  <option value="">choose…</option>
                  {ACTION_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value || '__none'}>{o.label}</option>)}
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
                    {review.map((d) => (
                      <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                        <td style={{ padding: '6px 8px' }}>{d.empNo}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'in')}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'out')}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <select className="field" style={{ width: 'auto' }} value={actionOf(d)} onChange={(e) => setAction(d, e.target.value)}>
                            {ACTION_OPTIONS.map((o) => (
                              <option key={o.value || '__none'} value={o.value} disabled={o.value === 'match' && !d.canMatch}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => downloadList(review, 'no-punches')}>Download list (.xlsx)</button>
              <button className="btn ghost" onClick={() => finishLeave(false)}>Leave all as is</button>
              <button className="btn" onClick={() => finishLeave(true)}>
                {!fromResult
                  ? (pickedCount ? `Apply ${pickedCount} & continue` : 'Continue')
                  : (pickedCount ? `Apply ${pickedCount} & generate` : 'Generate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stage === 'punch' && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Days with only one punch</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                These days have a time in or a time out but not both, and no VL, SL, HVL, HSL or LWOP in Remarks. It could be
                any of those leave types, or just a missed punch: Match the shift fills only the blank time from the shift
                schedule; Manual edit lets you type the times here. Anything left as is stays blank in the output.
              </p>
              <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0 }}>Set all to</label>
                <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setAllAction(reviewPartial.filter((d) => e.target.value !== 'match' || d.canMatch), e.target.value === '__none' ? '' : e.target.value)}>
                  <option value="">choose…</option>
                  {ACTION_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value || '__none'}>{o.label}</option>)}
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
                    {reviewPartial.map((d) => (
                      <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                        <td style={{ padding: '6px 8px' }}>{d.empNo}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'in')}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'out')}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <select className="field" style={{ width: 'auto' }} value={actionOf(d)} onChange={(e) => setAction(d, e.target.value)}>
                            {ACTION_OPTIONS.map((o) => (
                              <option key={o.value || '__none'} value={o.value} disabled={o.value === 'match' && !d.canMatch}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => downloadList(reviewPartial, 'one-punch')}>Download list (.xlsx)</button>
              <button className="btn ghost" onClick={() => finishPunch(false)}>Leave all as is</button>
              <button className="btn" onClick={() => finishPunch(true)}>
                {!fromResult
                  ? (fixCount ? `Apply ${fixCount} & continue` : 'Continue')
                  : (fixCount ? `Apply ${fixCount} & generate` : 'Generate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stage === 'remark' && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>Remarks that are not a leave code</h3>
              <button onClick={() => setStage(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                These days have something in Remarks that is not VL, SL, HVL, HSL or LWOP. It could still mean one of those
                leave types, or the times may need editing — pick what to do with each. Anything left as is stays exactly as it is in the sheet.
              </p>
              <div className="field-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0 }}>Set all to</label>
                <select className="field" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setAllAction(reviewRemark, e.target.value === '__none' ? '' : e.target.value)}>
                  <option value="">choose…</option>
                  {REMARK_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value || '__none'}>{o.label}</option>)}
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
                      <th style={{ padding: '6px 8px' }}>Remarks</th>
                      <th style={{ padding: '6px 8px' }}>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRemark.map((d) => (
                      <tr key={d.rowNum} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.rowNum}</td>
                        <td style={{ padding: '6px 8px' }}>{d.empNo}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.date}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{d.shift}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'in')}</td>
                        <td style={{ padding: '6px 8px' }}>{timeCell(d, 'out')}</td>
                        <td style={{ padding: '6px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.remarks}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <select className="field" style={{ width: 'auto' }} value={actionOf(d)} onChange={(e) => setAction(d, e.target.value)}>
                            {REMARK_OPTIONS.map((o) => <option key={o.value || '__none'} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => downloadList(reviewRemark, 'other-remarks')}>Download list (.xlsx)</button>
              <button className="btn ghost" onClick={() => finishRemark(false)}>Leave all as is</button>
              <button className="btn" onClick={() => finishRemark(true)}>
                {fromResult
                  ? (remarkCount ? `Apply ${remarkCount} & generate` : 'Generate')
                  : (remarkCount ? `Apply ${remarkCount} & continue` : 'Continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}