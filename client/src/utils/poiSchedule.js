// Helpers for a Point of Interest's schedule (see server/src/models/Poi.js).
//
//   { mode: 'none' }
//   { mode: 'daily', days: [{ day: 1, start: '09:00', end: '17:00' }, …] }   day = Date#getDay (0 = Sun)
//   { mode: 'once',  startDate, endDate, startTime, endTime }                  YYYY-MM-DD / HH:MM

// Shown Monday-first; `n` is the Date#getDay number stored on the server.
export const WEEKDAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 0, short: 'Sun', long: 'Sunday' },
];

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(s, withYear = true) {
  return parseDate(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : null) });
}

function localDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "Mon–Fri 9:00 AM–5:00 PM · Sat 10:00 AM–2:00 PM"
export function describeSchedule(s) {
  if (!s || s.mode === 'none') return '';

  if (s.mode === 'daily') {
    const byDay = new Map((s.days || []).map((d) => [d.day, d]));
    const order = WEEKDAYS.filter((w) => byDay.has(w.n));
    // Group weekdays that share the same hours, then collapse consecutive
    // runs (Mon, Tue, Wed → Mon–Wed).
    const groups = new Map();
    order.forEach((w, i) => {
      const { start, end } = byDay.get(w.n);
      const key = `${start}-${end}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ w, i });
    });
    return [...groups.entries()]
      .map(([key, members]) => {
        const [start, end] = key.split('-');
        const runs = [];
        members.forEach((m) => {
          const last = runs[runs.length - 1];
          if (last && m.i === last[last.length - 1].i + 1) last.push(m);
          else runs.push([m]);
        });
        const days = runs
          .map((r) => (r.length > 2 ? `${r[0].w.short}–${r[r.length - 1].w.short}` : r.map((m) => m.w.short).join(', ')))
          .join(', ');
        return `${days} ${fmtTime(start)}–${fmtTime(end)}`;
      })
      .join(' · ');
  }

  if (s.mode === 'once') {
    const sameDay = s.startDate === s.endDate;
    const days = sameDay
      ? fmtDate(s.startDate)
      : `${fmtDate(s.startDate, parseDate(s.startDate).getFullYear() !== parseDate(s.endDate).getFullYear())} – ${fmtDate(s.endDate)}`;
    return `${days} · ${fmtTime(s.startTime)}–${fmtTime(s.endTime)}`;
  }
  return '';
}

// Is `hhmm` inside [start, end)? An end before the start means the range
// runs past midnight (22:00–02:00); equal start and end means all day.
function inTimeRange(hhmm, start, end) {
  if (start === end) return true;
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

// A short live status for the list/map, or null when there's no schedule.
// `tone` picks the chip color: 'on' | 'off' | 'soon'.
export function scheduleStatus(s, now = new Date()) {
  if (!s || s.mode === 'none') return null;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (s.mode === 'daily') {
    const today = (s.days || []).find((d) => d.day === now.getDay());
    const yesterday = (s.days || []).find((d) => d.day === (now.getDay() + 6) % 7);
    // Today's own hours; if they run past midnight only the evening part
    // counts here (the small hours belong to yesterday's entry, below).
    const wraps = today && today.start > today.end;
    const openToday = today && (wraps ? hhmm >= today.start : inTimeRange(hhmm, today.start, today.end));
    // Hours that started yesterday evening and run past midnight.
    const spillover = yesterday && yesterday.start > yesterday.end && hhmm < yesterday.end;
    return openToday || spillover ? { label: 'Open now', tone: 'on' } : { label: 'Closed now', tone: 'off' };
  }

  if (s.mode === 'once') {
    const today = localDateStr(now);
    if (today < s.startDate) return { label: 'Upcoming', tone: 'soon' };
    if (today > s.endDate) return { label: 'Ended', tone: 'off' };
    return inTimeRange(hhmm, s.startTime, s.endTime)
      ? { label: 'Happening now', tone: 'on' }
      : { label: 'On today · not open yet', tone: 'soon' };
  }
  return null;
}
