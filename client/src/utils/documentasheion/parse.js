// Documentasheion — pure logic. Takes the rows of an "Attendance Data
// Template" sheet and works out what goes in each of the four import files.
// No spreadsheet library in here, so it can be tested on plain arrays.
//
// Layout of the source sheet (row 1 is the column header, skipped):
//   rows  <- one employee's timesheet, one row per day (Emp_No on every row)
//   (empty row)  <- end of that employee's timesheet
//   rows  <- next employee ...
// The template's sample block (Emp_No GD_001, first block of the sheet) is
// ignored.

const DAY = 86400000;

// Zero-based column positions in the Attendance Data Template.
const COL = { emp: 0, date: 1, shift: 2, in: 3, out: 4, otStart: 5, otEnd: 6, remarks: 7 };

// Emp_No used by the template's sample rows.
const SAMPLE_EMP = 'GD_001';

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

// Leave types. Remarks (column I) or the review dialog set one per day.
//   VL / SL    -> full day: time in/out become the shift's own start/end
//   HVL / HSL  -> half day: the half that was NOT worked is filled from the shift
//   LWOP       -> left exactly as it is
// "HSV" is accepted as a spelling of HSL.
export const LEAVE_TYPES = ['VL', 'SL', 'HVL', 'HSL', 'LWOP'];

const REMARK_ALIASES = {
  VL: 'VL', SL: 'SL', HVL: 'HVL', HSL: 'HSL', HSV: 'HSL', LWOP: 'LWOP',
  HALFVL: 'HVL', HALFSL: 'HSL', HALFSV: 'HSL', HALFDAYVL: 'HVL', HALFDAYSL: 'HSL',
};

// "Half VL", "half-sl", "H.S.L" ... -> 'HVL' | 'HSL' | 'VL' | 'SL' | 'LWOP' | ''
export function parseLeave(v) {
  const key = String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return REMARK_ALIASES[key] || '';
}

// Half-day leave splits the shift at 12:00 noon. For a shift that does not
// contain noon (e.g. a night shift) the split falls back to the middle of the
// worked hours, taking BREAK_MIN out of the shift length.
const NOON = 12 * 60;
const BREAK_MIN = 60;
// How close to the half-way point a punch can be and still count as
// "the person came in for the second half" / "left after the first half".
const HALF_GRACE = 60;

// Shift start/end from the shift code itself (AM_0800_1700, PM_2200_0700_CM ...)
function timesFromCode(code) {
  const m = String(code).match(/(\d{2})(\d{2})_(\d{2})(\d{2})/);
  if (!m) return null;
  const s = +m[1] * 60 + +m[2];
  const e = +m[3] * 60 + +m[4];
  if (+m[1] > 23 || +m[3] > 23 || +m[2] > 59 || +m[4] > 59) return null;
  return { start: s, end: e };
}

// signed distance of clock time t from the shift start, -720..+719 minutes
const offset = (t, start) => ((t - start + 720 + 1440) % 1440) - 720;

// ---- main --------------------------------------------------------------

// rows: array of 9-element arrays (columns A..I), starting at sheet row 2.
// options:
//   knownShifts : Set of upper-cased shift names/codes (Master Shift Daily)
//   shiftTimes  : Map of upper-cased shift name/code -> { start, end } minutes
//   overrides   : { [sourceRowNumber]: 'VL'|'SL'|'HVL'|'HSL'|'LWOP' } picked in the leave dialog
//   punchFixes  : { [sourceRowNumber]: { mode: 'match' | 'manual', timeIn, timeOut } } from the missing-punch dialog
export function buildDatasets(rows, { knownShifts, shiftTimes, overrides = {}, punchFixes = {} } = {}) {
  const warnings = [];
  const warn = (row, message) => warnings.push({ row, message });

  const onDay = [];
  const perDay = [];
  const overtime = [];

  const employees = new Map(); // empNo -> { empNo, byDate: Map(ms -> {shift, remarks}) }
  const allDates = new Set();
  const records = [];
  let blocks = 0;
  let sampleRows = 0;

  // ---- pass 1: walk the blocks and collect day records -------------------
  let block = null;
  let sawReal = false;

  rows.forEach((r, i) => {
    const rowNum = i + 2;

    // Empty row = end of the current employee's timesheet.
    if (r.every(isBlank)) {
      block = null;
      return;
    }

    // A new block starts at the first filled row after an empty row.
    const startsBlock = !block;
    if (startsBlock) block = { empNo: '', sample: false };

    const empNo = text(r[COL.emp]) || block.empNo;

    // The template's sample block (GD_001) at the top of the sheet.
    if (startsBlock && !sawReal && empNo.toUpperCase() === SAMPLE_EMP) block.sample = true;
    if (block.sample) {
      sampleRows += 1;
      return;
    }
    if (startsBlock) {
      sawReal = true;
      blocks += 1;
    }

    if (!empNo) {
      warn(rowNum, 'No Emp_No on this row or earlier in this employee\'s block — skipped.');
      return;
    }
    if (block.empNo && empNo !== block.empNo) {
      warn(rowNum, `Emp_No changes from ${block.empNo} to ${empNo} inside one employee block — is an empty row missing before this row?`);
    }
    block.empNo = block.empNo || empNo;

    const dateMs = parseDate(r[COL.date]);
    if (dateMs == null) {
      warn(rowNum, `${empNo}: Attend_Date is missing or unreadable — row skipped.`);
      return;
    }
    allDates.add(dateMs);

    if (!employees.has(empNo)) employees.set(empNo, { empNo, byDate: new Map() });
    const emp = employees.get(empNo);
    if (emp.byDate.has(dateMs)) warn(rowNum, `${empNo}: ${fmtDate(dateMs)} appears more than once — the later row wins in the shift schedule.`);
    const shift = text(r[COL.shift]);
    emp.byDate.set(dateMs, { shift, rowNum });

    records.push({ rowNum, r, empNo, dateMs, shift, remarks: text(r[COL.remarks]) });
  });

  // ---- usual shift per employee (for days where the shift column holds a leave label)
  const usualShift = new Map();
  for (const emp of employees.values()) {
    const tally = new Map();
    for (const { shift } of emp.byDate.values()) {
      const key = shift.toUpperCase();
      if (!shift || key === 'OFF' || key === 'LWOP' || parseLeave(shift)) continue;
      tally.set(shift, (tally.get(shift) || 0) + 1);
    }
    usualShift.set(emp.empNo, [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '');
  }

  const timesOf = (code) => {
    if (!code) return null;
    return shiftTimes?.get(code.toUpperCase()) || timesFromCode(code);
  };

  // ---- pass 2: classify each day -----------------------------------------
  const review = []; // working days with no punches at all and no leave remark
  const reviewPartial = []; // working days with only a time in or only a time out and no leave remark
  const reviewRemark = []; // days with a remark that is not a leave code (e.g. "test") and nothing else needing a decision
  let punchFixed = 0;
  let offDayOt = 0; // OFF days that have attendance -> overtime
  const leaveCount = { VL: 0, SL: 0, HVL: 0, HSL: 0, LWOP: 0 };
  let dayRows = 0;

  for (const rec of records) {
    const { rowNum, r, empNo, dateMs } = rec;
    const dateStr = fmtDate(dateMs);
    dayRows += 1;

    const read = (col, label) => {
      const t = parseTime(r[col]);
      if (Number.isNaN(t)) {
        warn(rowNum, `${empNo} ${dateStr}: ${label} "${String(r[col])}" is not a readable time — treated as blank.`);
        return null;
      }
      return t;
    };
    let inM = read(COL.in, 'Attend_Time IN');
    let outM = read(COL.out, 'Attend_Time OUT');
    const otS = read(COL.otStart, 'Approved Overtime Start time');
    const otE = read(COL.otEnd, 'Approved Overtime End time');

    // The shift to use: the shift column, or the usual one if that column holds a leave label.
    const labelInShiftCol = parseLeave(rec.shift);
    const shiftCode = labelInShiftCol ? usualShift.get(empNo) : rec.shift;

    // Leave type: Remarks first, then a label typed in the shift column, then the review dialog.
    const remarkLeave = parseLeave(rec.remarks);
    const leave = remarkLeave || labelInShiftCol || overrides[rowNum] || '';

    if (leave) leaveCount[leave] += 1;

    if (leave === 'VL' || leave === 'SL' || leave === 'HVL' || leave === 'HSL') {
      const st = timesOf(shiftCode);
      if (!st) {
        warn(rowNum, `${empNo} ${dateStr}: ${leave} but no start/end could be found for shift "${shiftCode || rec.shift}" — times left as they are.`);
      } else if (leave === 'VL' || leave === 'SL') {
        // Full day: the shift's own times.
        inM = st.start;
        outM = st.end;
      } else {
        // Half day: fill the half that was not worked.
        const dur = ((st.end - st.start + 1440) % 1440) || 1440;
        const containsNoon = st.start < st.end && st.start < NOON && NOON < st.end;
        const half = containsNoon ? NOON - st.start : Math.round((dur - BREAK_MIN) / 2); // minutes after shift start
        const inOff = inM === null ? null : offset(inM, st.start);
        const outOff = outM === null ? null : offset(outM, st.start);
        if (inM === null && outM === null) {
          inM = st.start; // nothing punched: the first half only
          outM = (st.start + half) % 1440;
        } else {
          // Came in for the second half -> start at the shift start.
          if (inOff !== null && inOff >= half - HALF_GRACE) inM = st.start;
          // Left after the first half -> end at the shift end.
          if (outOff !== null && outOff > 0 && outOff <= half + HALF_GRACE) outM = st.end;
          // Only one punch: complete the day from the shift for the half that was taken as leave.
          if (outM === null && inOff !== null && inOff < half - HALF_GRACE) outM = st.end; // worked the first half
          if (inM === null && outOff !== null && outOff > half + HALF_GRACE) inM = st.start; // worked the second half
        }
      }
    }

    // Working days with a missing punch and nothing to explain it -> ask the user.
    const shiftKey = (rec.shift || '').toUpperCase();
    const isWorkDay = rec.shift && shiftKey !== 'OFF' && shiftKey !== 'LWOP' && !labelInShiftCol;
    const missingPunch = isWorkDay && (inM === null || outM === null);
    // A remark that is not VL/SL/HVL/HSL/LWOP: could be any of them or need a manual edit -> ask.
    const unknownRemark = !leave && !missingPunch && !!rec.remarks;
    if (!leave && (missingPunch || unknownRemark)) {
      const st = timesOf(shiftCode);
      const base = {
        rowNum, empNo, date: dateStr, shift: rec.shift,
        timeIn: inM === null ? '' : fmtTime(inM), timeOut: outM === null ? '' : fmtTime(outM),
        remarks: rec.remarks,
        // What "match the shift" would put in the blank time(s).
        matchIn: st ? fmtTime(st.start) : '',
        matchOut: st ? fmtTime(st.end) : '',
        canMatch: !!st,
      };
      if (unknownRemark) reviewRemark.push(base);
      else if (inM === null && outM === null) review.push(base);
      else reviewPartial.push(base);

      // Apply the choice made in the dialog.
      const fix = punchFixes[rowNum];
      if (fix && fix.mode === 'match') {
        if (st) {
          if (inM === null) inM = st.start;
          if (outM === null) outM = st.end;
          punchFixed += 1;
        } else warn(rowNum, `${empNo} ${dateStr}: no start/end could be found for shift "${shiftCode}" — missing time left blank.`);
      } else if (fix && fix.mode === 'manual') {
        const mi = fix.timeIn ? parseTime(fix.timeIn) : null;
        const mo = fix.timeOut ? parseTime(fix.timeOut) : null;
        if (Number.isNaN(mi) || Number.isNaN(mo)) warn(rowNum, `${empNo} ${dateStr}: the manual time is not readable — left as it was.`);
        else {
          if (mi !== null) inM = mi;
          if (mo !== null) outM = mo;
          punchFixed += 1;
        }
      }
    }

    const isOffDay = shiftKey === 'OFF';
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

    // ---- OFF day with attendance -> counts as overtime
    // The person was not scheduled but punched, so the worked time is OT.
    // Approved OT times in the sheet win; otherwise the punches are the OT window.
    if (isOffDay && !leave && otS === null && otE === null && (hasIn || hasOut)) {
      if (hasIn && hasOut) {
        const endDay = outM < inM ? 1 : 0;
        overtime.push([empNo, dateStr, '', dateStr, fmtTime(inM), fmtDate(dateMs + endDay * DAY), fmtTime(outM)]);
        offDayOt += 1;
        warn(rowNum, `${empNo} ${dateStr}: shift is OFF but there is attendance (${fmtTime(inM)}–${fmtTime(outM)}) — added to Overtime Request.`);
      } else {
        warn(rowNum, `${empNo} ${dateStr}: shift is OFF and only Time ${hasIn ? 'IN' : 'OUT'} was recorded — cannot make an overtime row, please check.`);
      }
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
  }

  // ---- shift schedule ---------------------------------------------------
  // The shift column as it is (OFF, LWOP too); VL/SL/Half leave keep the scheduled shift.
  const dates = [...allDates].sort((a, b) => a - b);

  const schedule = [...employees.values()].map((emp) => {
    const cells = {};
    for (const [ms, { shift, rowNum }] of emp.byDate) {
      if (parseLeave(shift) && parseLeave(shift) !== 'LWOP') {
        const usual = usualShift.get(emp.empNo);
        cells[ms] = usual;
        warn(rowNum, `${emp.empNo} ${fmtDate(ms)}: shift column says "${shift}" instead of a shift code — used ${usual ? `the usual shift ${usual}` : 'nothing (no usual shift found)'}.`);
      } else {
        cells[ms] = shift;
      }
    }
    return { empNo: emp.empNo, name: '', cells }; // no name column in the source sheet
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
    review,
    reviewPartial,
    reviewRemark,
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
      leave: leaveCount,
      punchFixed,
      offDayOt,
    },
  };
}
