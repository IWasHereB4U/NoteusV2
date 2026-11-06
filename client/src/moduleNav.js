// Single source of truth for path -> "module" mapping. Shared by the nav
// rail (which modules to show at all) and the person-switcher (which
// people are clickable while you're looking at a given module page).
// `key` mirrors MODULE_KEYS on the server; items without one (Dashboard)
// aren't gated by sharing.
//
// `group` files an item under a collapsible category in the nav rail (see
// NAV_GROUPS). Items without one (Dashboard) always sit at the top.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◆', end: true },
  { to: '/clients', label: 'Clients', icon: '◔', key: 'clients', group: 'work' },
  { to: '/money', label: 'Money', icon: '◈', key: 'money', group: 'work' },
  { to: '/bankbook', label: 'Bankbook', icon: '▣', key: 'bankbook', group: 'work' },
  // MGOctaviano07Oct2026: Invoices removed, Project Timeline added.
  { to: '/project-timeline', label: 'Project Timeline', icon: '▬', key: 'projecttimeline', group: 'work' },
  { to: '/tasks', label: 'Tasks', icon: '☑', key: 'tasks', group: 'work' },
  { to: '/meetings', label: 'Meetings', icon: '◷', key: 'meetings', group: 'work' },
  { to: '/timesheet', label: 'Timesheet', icon: '▥', key: 'timesheet', group: 'work' },
  { to: '/calendar', label: 'Calendar', icon: '▧', key: 'calendar', group: 'plan' },
  { to: '/filing', label: 'Filing desk', icon: '▦', key: 'filing', group: 'plan' },
  { to: '/notes', label: 'Notes', icon: '✎', key: 'notes', group: 'notes' },
  { to: '/note-tags', label: 'Note Tag', icon: '#', key: 'notetags', group: 'notes' },
  // The `maps` key (and /api/map-destinations) keep their original names so
  // existing data and circle sharing settings carry over; only the label and
  // URL changed when Maps became Destination.
  { to: '/destination', label: 'Destination', icon: '⌖', key: 'maps', group: 'places' },
  { to: '/poi', label: 'Point of Interest', icon: '⚑', key: 'poi', group: 'places' },
  // Personal utility, not book data — no `key`, so it isn't gated by circle sharing.
  { to: '/converter', label: 'File converter', icon: '⇄', group: 'tools' },
  // Excel in, four HR import files out. Same deal: personal utility, no `key`.
  { to: '/documentasheion', label: 'Documentasheion', icon: '▤', group: 'tools' },
];

// Display order of the collapsible categories in the nav rail. `short` is the
// tiny label that fits the 64px rail.
export const NAV_GROUPS = [
  { id: 'work', label: 'Work', short: 'Work' },
  { id: 'plan', label: 'Planning', short: 'Plan' },
  { id: 'notes', label: 'Notes', short: 'Notes' },
  { id: 'places', label: 'Places', short: 'Places' },
  { id: 'tools', label: 'Tools', short: 'Tools' },
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
