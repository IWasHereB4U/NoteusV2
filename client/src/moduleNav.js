// Single source of truth for path -> "module" mapping. Shared by the nav
// rail (which modules to show at all) and the person-switcher (which
// people are clickable while you're looking at a given module page).
// `key` mirrors MODULE_KEYS on the server; items without one (Dashboard)
// aren't gated by sharing.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◆', end: true },
  { to: '/clients', label: 'Clients', icon: '◔', key: 'clients' },
  { to: '/money', label: 'Money', icon: '◈', key: 'money' },
  // MGOctaviano07Oct2026: Invoices removed, Project Timeline added.
  { to: '/project-timeline', label: 'Project Timeline', icon: '▬', key: 'projecttimeline' },
  { to: '/tasks', label: 'Tasks', icon: '☑', key: 'tasks' },
  { to: '/meetings', label: 'Meetings', icon: '◷', key: 'meetings' },
  { to: '/timesheet', label: 'Timesheet', icon: '▥', key: 'timesheet' },
  { to: '/calendar', label: 'Calendar', icon: '▧', key: 'calendar' },
  { to: '/filing', label: 'Filing desk', icon: '▦', key: 'filing' },
  { to: '/notes', label: 'Notes', icon: '✎', key: 'notes' },
  { to: '/note-tags', label: 'Note Tag', icon: '#', key: 'notetags' },
  { to: '/maps', label: 'Maps', icon: '⌖', key: 'maps' },
  // Personal utility, not book data — no `key`, so it isn't gated by circle sharing.
  { to: '/converter', label: 'File converter', icon: '⇄' },
];

// Longest-prefix match so nested routes (e.g. a note card's own URL under
// /notes/...) still resolve back to their parent module.
export function moduleForPath(pathname) {
  let best = null;
  for (const item of NAV_ITEMS) {
    if (item.to === '/') {
      if (pathname === '/') best = item;
      continue;
    }
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best; // matching NAV_ITEMS entry, or null (e.g. /circle, /settings)
}