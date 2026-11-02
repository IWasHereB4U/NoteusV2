// Documentasheion — pure logic. Takes the rows of an "Attendance Data
// Template" sheet and works out what goes in each of the four import files.
// No spreadsheet library in here, so it can be tested on plain arrays.
//
// Layout of the source sheet (row 1 is the column header, skipped):
//   ####  <- header row of an employee: only column A (the name) is filled
//   rows  <- that employee's timesheet, one row per day
//   (empty row)  <- end of the employee's timesheet
//   ####  <- next employee ...
// Any rows before the first header row are the template's sample rows and
// are ignored.

const DAY = 86400000;

// Zero-based column positions in the Attendance Data Template.
const COL = { name: 0, emp: 1, date: 2, shift: 3, in: 4, out: 5, otStart: 6, otEnd: 7, remarks: 8 };

const pad = (n) => String(n).padStart(2, '0');
const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

function text(v) {
  if (isBlank(v)) return '';
  if (v instanceof Date) return '';
  return String(v).trim();
}

// ---- parsing -----------------------------------------------------------

// Returns midnight (UTC ms) of the date, or null when blank / unreadable.
// Dates are handled in UTC throughout so the user's time zone never shifts a day.
export function parseDate(v) {
  if (isBlank(v)) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (!(v > 59)) return null;
    return Math.floor(Math.round((v - 25569) * DAY) / DAY) * DAY;
  }
  const s = String(v).trim();
  let y, m, d;
  let hit = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // MM/DD/YYYY
  if (hit) [, m, d, y] = hit;
  else if ((hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = hit; // YYYY-MM-DD
  else return null;
  const ms = Date.UTC(+y, +m - 1, +d);
  const back = new Date(ms);
  if (back.getUTCMonth() !== +m - 1 || back.getUTCDate() !== +d) return null;
  return ms;
}

// Returns minutes after midnight, null when blank, NaN when unreadable.
export function parseTime(v) {
  if (isBlank(v)) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return NaN;
    return v.getUTCHours() * 60 + v.getUTCMinutes();
  }
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    return Math.round(frac * 1440) % 1440;
  }
  const s = String(v).trim();
  let hit = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!hit) hit = s.match(/^(\d{1,2})(\d{2})\s*(am|pm)?$/i); // 0800
  if (!hit) return NaN;
  let h = +hit[1];
  const m = +hit[2];
  const ap = hit[3] && hit[3].toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || m > 59) return NaN;
  return h * 60 + m;
}

// ---- formatting (everything is output as text) -------------------------

export const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
};
export const fmtTime = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const fmtDateTime = (ms, min) => `${fmtDate(ms)} ${fmtTime(min)}`;

// ---- leave handling ----------------------------------------------------

// A leave label sitting where a shift code should be. VL / SL / Half VL /
// Half SL take the employee's shift schedule instead.
const LEAVE_LABEL = /^(half[\s_-]*)?(vl|sl)$/i;

// ---- main --------------------------------------------------------------

// rows: array of 9-element arrays (columns A..I), starting at sheet row 2.
// knownShifts: optional Set of upper-cased shift names/codes (Master Shift Daily).
export function buildDatasets(rows, { knownShifts } = {}) {
  const warnings = [];
  const warn = (row, message) => warnings.push({ row, message });

  const onDay = [];
  const perDay = [];
  const overtime = [];

  const employees = new Map(); // empNo -> { empNo, name, byDate: Map(ms -> {shift, remarks}) }
  const allDates = new Set();
  let blocks = 0;
  let sampleRows = 0;
  let dayRows = 0;

  let block = null;
  let sawHeader = false;

  rows.forEach((r, i) => {
    const rowNum = i + 2;

    // Empty row = end of the current employee's timesheet.
    if (r.every(isBlank)) {
      block = null;
      return;
    }

    const noEmp = isBlank(r[COL.emp]);
    const noDate = isBlank(r[COL.date]);
    const restBlank = r.slice(COL.shift).every(isBlank);

    // Header row: only the name is filled.
    if (noEmp && noDate && restBlank && !isBlank(r[COL.name])) {
      block = { name: text(r[COL.name]), empNo: '' };
      sawHeader = true;
      blocks += 1;
      return;
    }

    if (!block) {
      if (!sawHeader) sampleRows += 1; // template sample rows, before the first header
      else warn(rowNum, 'Row is not under an employee header (no header row above it after the last empty row) — skipped.');
      return;
    }

    const empNo = text(r[COL.emp]) || block.empNo;
    if (!empNo) {
      warn(rowNum, 'No Emp_No on this row or earlier in this employee\'s block — skipped.');
      return;
    }
    if (block.empNo && empNo !== block.empNo) {
      warn(rowNum, `Emp_No changes from ${block.empNo} to ${empNo} inside one employee block — is an empty row missing before this row? It was filed under "${block.name}".`);
    }
    block.empNo = block.empNo || empNo;

    const dateMs = parseDate(r[COL.date]);
    if (dateMs == null) {
      warn(rowNum, `${empNo}: Attend_Date is missing or unreadable — row skipped.`);
      return;
    }

    dayRows += 1;
    allDates.add(dateMs);
    const dateStr = fmtDate(dateMs);

    // ---- shift schedule bookkeeping
    if (!employees.has(empNo)) employees.set(empNo, { empNo, name: block.name, byDate: new Map() });
    const emp = employees.get(empNo);
    if (!emp.name && block.name) emp.name = block.name;
    if (emp.byDate.has(dateMs)) warn(rowNum, `${empNo}: ${dateStr} appears more than once — the later row wins in the shift schedule.`);
    emp.byDate.set(dateMs, { shift: text(r[COL.shift]), remarks: text(r[COL.remarks]), rowNum });

    // ---- times
    const read = (col, label) => {
      const t = parseTime(r[col]);
      if (Number.isNaN(t)) {
        warn(rowNum, `${empNo} ${dateStr}: ${label} "${String(r[col])}" is not a readable time — treated as blank.`);
        return null;
      }
      return t;
    };
    const inM = read(COL.in, 'Attend_Time IN');
    const outM = read(COL.out, 'Attend_Time OUT');
    const otS = read(COL.otStart, 'Approved Overtime Start time');
    const otE = read(COL.otEnd, 'Approved Overtime End time');

    const hasIn = inM !== null;
    const hasOut = outM !== null;
    // The shift runs past midnight when the out time is earlier than the in time.
    const shiftCrosses = hasIn && hasOut && outM < inM;

    // ---- overtime
    let otCrosses = false;
    if ((otS === null) !== (otE === null)) {
      warn(rowNum, `${empNo} ${dateStr}: overtime has only a ${otS === null ? 'end' : 'start'} time — overtime row skipped.`);
    } else if (otS !== null) {
      // On a shift that crosses midnight, a clock time at or before the out
      // time belongs to the next calendar day.
      const nextDay = (t) => (shiftCrosses && t <= outM ? 1 : 0);
      const sDay = nextDay(otS);
      let eDay = nextDay(otE);
      if (!shiftCrosses && otE < otS) eDay = 1;
      if (eDay * 1440 + otE < sDay * 1440 + otS) eDay += 1;
      otCrosses = sDay > 0 || eDay > 0;
      overtime.push([empNo, dateStr, '', fmtDate(dateMs + sDay * DAY), fmtTime(otS), fmtDate(dateMs + eDay * DAY), fmtTime(otE)]);
    }

    // ---- attendance
    if (hasIn || hasOut) {
      if (shiftCrosses) {
        // Start date and end date of the shift differ -> Per Day file.
        perDay.push([empNo, dateStr, fmtDateTime(dateMs, inM), fmtDateTime(dateMs + DAY, outM)]);
      } else if (!otCrosses) {
        onDay.push([empNo, dateStr, hasIn ? fmtTime(inM) : '', hasOut ? fmtTime(outM) : '']);
        if (!hasIn || !hasOut) {
          warn(rowNum, `${empNo} ${dateStr}: only Time ${hasIn ? 'IN' : 'OUT'} was recorded — added to Attendance On Day with the other time blank.`);
        }
      } else {
        warn(rowNum, `${empNo} ${dateStr}: overtime runs past midnight but the shift does not — not placed in either attendance file, please check.`);
      }
    }
  });

  // ---- shift schedule ---------------------------------------------------
  const dates = [...allDates].sort((a, b) => a - b);

  const schedule = [...employees.values()].map((emp) => {
    // Most common real shift for this employee, used only when a leave label
    // (VL / SL / Half VL / Half SL) has been typed in the shift column.
    const tally = new Map();
    for (const { shift } of emp.byDate.values()) {
      const key = shift.toUpperCase();
      if (!shift || key === 'OFF' || key === 'LWOP' || LEAVE_LABEL.test(shift)) continue;
      tally.set(shift, (tally.get(shift) || 0) + 1);
    }
    const usual = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const cells = {};
    for (const [ms, { shift, rowNum }] of emp.byDate) {
      if (LEAVE_LABEL.test(shift)) {
        cells[ms] = usual;
        warn(rowNum, `${emp.empNo} ${fmtDate(ms)}: shift column says "${shift}" instead of a shift code — used ${usual ? `the usual shift ${usual}` : 'nothing (no usual shift found)'}.`);
      } else {
        // Real shift codes, OFF and LWOP are written exactly as they are.
        cells[ms] = shift;
      }
    }
    return { empNo: emp.empNo, name: emp.name, cells };
  });

  // Shift codes that aren't in the Master Shift Daily sheet.
  if (knownShifts && knownShifts.size) {
    const unknown = new Map();
    for (const emp of schedule) {
      for (const v of Object.values(emp.cells)) {
        if (v && !knownShifts.has(v.toUpperCase())) unknown.set(v, (unknown.get(v) || 0) + 1);
      }
    }
    for (const [code, n] of unknown) {
      warn(null, `Shift "${code}" is not in the Master Shift Daily list (${n} day${n > 1 ? 's' : ''}) — the import may reject it.`);
    }
  }

  return {
    onDay,
    perDay,
    overtime,
    schedule: { dates: dates.map((ms) => ({ ms, label: fmtDate(ms) })), employees: schedule },
    warnings,
    stats: {
      employees: employees.size,
      blocks,
      dayRows,
      sampleRows,
      onDay: onDay.length,
      perDay: perDay.length,
      overtime: overtime.length,
      scheduleRows: schedule.length,
      scheduleDates: dates.length,
    },
  };
}
