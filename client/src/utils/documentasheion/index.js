import { buildDatasets } from './parse.js';

// The four blank templates live in client/public/templates/. Replace a file
// there (e.g. when the Master Shift Daily list changes) and the module picks
// it up — nothing else to edit.
export const OUTPUTS = [
  { id: 'onDay', label: 'Attendance On Day', file: 'AttendanceOnDay.xlsx', template: 'AttendanceOnDay.xlsx' },
  { id: 'perDay', label: 'Attendance Per Day', file: 'AttendancePerDay.xlsx', template: 'AttendancePerDay.xlsx' },
  { id: 'overtime', label: 'Overtime Request', file: 'Template_Overtime_Request.xlsx', template: 'Template_Overtime_Request.xlsx' },
  { id: 'schedule', label: 'Shift Schedule', file: 'ShiftScheduleTemplate.xlsx', template: 'ShiftScheduleTemplate.xlsx' },
];

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TEXT_FONT = { name: 'Calibri', size: 11 };
const clone = (o) => JSON.parse(JSON.stringify(o));

// Flatten whatever ExcelJS hands back for a cell (rich text, formula result,
// hyperlink, error) into a plain string / number / Date / null.
function plain(v) {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== 'object') return v;
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return plain(v.result);
  if ('text' in v) return plain(v.text);
  if ('error' in v) return null;
  return null;
}

async function loadWorkbook(ExcelJS, data) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb;
}

// Rows 2..n of the first sheet as 9-element arrays (columns A..I).
async function readAttendanceRows(ExcelJS, data) {
  const wb = await loadWorkbook(ExcelJS, data);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no sheets.');

  const head = (c) => String(plain(ws.getRow(1).getCell(c).value) ?? '');
  if (!/emp/i.test(head(2)) || !/date/i.test(head(3))) {
    throw new Error('This does not look like the Attendance Data Template — expected Emp_No in column B and Attend_Date in column C of row 1.');
  }

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const out = [];
    for (let c = 1; c <= 9; c += 1) out.push(plain(row.getCell(c).value));
    rows.push(out);
  }
  return rows;
}

// Write a value as text: string value + the "@" (Text) number format.
function putText(cell, value, style) {
  cell.value = value === '' || value == null ? null : String(value);
  cell.numFmt = '@';
  cell.font = { ...(style?.font || TEXT_FONT) };
  if (style?.alignment) cell.alignment = clone(style.alignment);
}

// Blank every cell from `startRow` down (the template's sample rows).
// Done cell by cell: ExcelJS's spliceRows leaves rows behind when removing
// down to the end of the sheet.
function clearFrom(ws, startRow) {
  for (let r = startRow; r <= ws.rowCount; r += 1) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }
}

function fillSimple(ws, startRow, rows, widths) {
  clearFrom(ws, startRow);
  rows.forEach((values, i) => {
    const row = ws.getRow(startRow + i);
    values.forEach((v, c) => putText(row.getCell(c + 1), v));
  });
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

async function writeOnDay(ExcelJS, tpl, data) {
  const wb = await loadWorkbook(ExcelJS, tpl);
  fillSimple(wb.worksheets[0], 2, data.onDay, [20, 24, 20, 20]);
  return wb.xlsx.writeBuffer();
}

async function writePerDay(ExcelJS, tpl, data) {
  const wb = await loadWorkbook(ExcelJS, tpl);
  fillSimple(wb.worksheets[0], 2, data.perDay, [20, 26, 34, 34]);
  return wb.xlsx.writeBuffer();
}

async function writeOvertime(ExcelJS, tpl, data) {
  const wb = await loadWorkbook(ExcelJS, tpl);
  // Sheet 1 = the request grid (title, blank row, header, data from row 4).
  // Sheet 2 = Overtime Reason lookup, left as the template has it.
  fillSimple(wb.worksheets[0], 4, data.overtime, [25, 20, 24, 26, 14, 24, 14]);
  return wb.xlsx.writeBuffer();
}

async function writeSchedule(ExcelJS, tpl, data) {
  const wb = await loadWorkbook(ExcelJS, tpl);
  const ws = wb.worksheets[0];
  const FIRST_DATE_COL = 5;
  const { dates, employees } = data.schedule;

  // Borrow the look of the template's own header / body cells before clearing.
  const hdrStyle = clone(ws.getRow(3).getCell(FIRST_DATE_COL).style);
  const bodyStyles = [];
  for (let c = 1; c <= FIRST_DATE_COL; c += 1) bodyStyles.push(clone(ws.getRow(4).getCell(c).style));

  // Drop the sample date column(s) in row 3 and the sample employee row(s).
  for (let c = FIRST_DATE_COL; c <= Math.max(ws.columnCount, FIRST_DATE_COL); c += 1) {
    const cell = ws.getRow(3).getCell(c);
    cell.value = null;
    cell.style = {};
  }
  clearFrom(ws, 4);

  dates.forEach((d, i) => {
    const cell = ws.getRow(3).getCell(FIRST_DATE_COL + i);
    cell.value = d.label;
    cell.style = clone(hdrStyle);
    cell.numFmt = '@';
    ws.getColumn(FIRST_DATE_COL + i).width = i === 0 ? 20 : 18;
  });

  employees.forEach((emp, r) => {
    const row = ws.getRow(4 + r);
    // Department and position are not in the attendance template -> left blank.
    [emp.empNo, emp.name, '', ''].forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.style = clone(bodyStyles[c]);
      putText(cell, v, bodyStyles[c]);
    });
    dates.forEach((d, i) => {
      const cell = row.getCell(FIRST_DATE_COL + i);
      cell.style = clone(bodyStyles[FIRST_DATE_COL - 1]);
      putText(cell, emp.cells[d.ms] ?? '', bodyStyles[FIRST_DATE_COL - 1]);
    });
  });

  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 26;
  return wb.xlsx.writeBuffer();
}

const WRITERS = { onDay: writeOnDay, perDay: writePerDay, overtime: writeOvertime, schedule: writeSchedule };

// Shift names/codes and their start/end times from the Master Shift Daily sheet.
async function readMasterShifts(ExcelJS, tpl) {
  const wb = await loadWorkbook(ExcelJS, tpl);
  const ws = wb.getWorksheet('Master Shift Daily');
  const known = new Set();
  const times = new Map();
  if (!ws) return { known, times };
  for (let r = 4; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const name = String(plain(row.getCell(2).value) ?? '').trim();
    const code = String(plain(row.getCell(3).value) ?? '').trim();
    const range = String(plain(row.getCell(5).value) ?? '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    for (const k of [name, code]) {
      if (!k) continue;
      known.add(k.toUpperCase());
      if (range) times.set(k.toUpperCase(), { start: +range[1] * 60 + +range[2], end: +range[3] * 60 + +range[4] });
    }
  }
  return { known, times };
}

// Step 1 (browser): load everything and read the sheet. Returns a "prepared"
// object plus the days that need a leave decision (`review`).
export async function prepareFromFile(file, { onStatus } = {}) {
  const ExcelJS = (await import('exceljs')).default; // lazy — it is a big library
  const base = import.meta.env?.BASE_URL || '/';

  onStatus?.('Loading templates…');
  const templates = {};
  for (const o of OUTPUTS) {
    const res = await fetch(`${base}templates/${o.template}`);
    if (!res.ok) throw new Error(`Could not load the ${o.label} template (${res.status}).`);
    templates[o.id] = await res.arrayBuffer();
  }

  onStatus?.('Reading attendance data…');
  return prepare(ExcelJS, await file.arrayBuffer(), templates);
}

export async function prepare(ExcelJS, attendanceData, templates) {
  const rows = await readAttendanceRows(ExcelJS, attendanceData);
  const { known, times } = await readMasterShifts(ExcelJS, templates.schedule);
  const opts = { knownShifts: known, shiftTimes: times };
  const first = buildDatasets(rows, opts); // no overrides yet — just to find what needs asking
  return { ExcelJS, rows, templates, opts, review: first.review, reviewPartial: first.reviewPartial };
}

// Step 2: apply the leave choices made in the dialog and write the four files.
// overrides  = { [sourceRowNumber]: 'VL' | 'SL' | 'HVL' | 'HSL' | 'LWOP' }
// punchFixes = { [sourceRowNumber]: { mode: 'match' | 'manual', timeIn, timeOut } }
export async function finish(prepared, overrides = {}, onStatus, punchFixes = {}) {
  const { ExcelJS, rows, templates, opts } = prepared;
  const data = buildDatasets(rows, { ...opts, overrides, punchFixes });

  const files = [];
  for (const o of OUTPUTS) {
    onStatus?.(`Writing ${o.label}…`);
    const buf = await WRITERS[o.id](ExcelJS, templates[o.id], data);
    files.push({
      id: o.id,
      label: o.label,
      name: o.file,
      rows: o.id === 'schedule' ? data.stats.scheduleRows : data.stats[o.id],
      buffer: buf,
    });
  }
  return { files, stats: data.stats, warnings: data.warnings, review: data.review };
}

// Convenience for tests / scripts: both steps in one go.
export async function generate(ExcelJS, attendanceData, templates, onStatus, overrides = {}, punchFixes = {}) {
  const prepared = await prepare(ExcelJS, attendanceData, templates);
  return finish(prepared, overrides, onStatus, punchFixes);
}
