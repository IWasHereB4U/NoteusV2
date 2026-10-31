import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { NAV_ITEMS, NAV_GROUPS, moduleForPath } from '../moduleNav.js';

const COLLAPSED_KEY = 'noteus_rail_collapsed';

// Which categories the person has folded away, remembered per browser.
// Storage can be unavailable (private mode, blocked cookies), so every
// access is guarded and the rail just starts fully expanded.
function loadCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}
function saveCollapsed(set) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function RailLink({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'on' : '')}
      title={item.label}
    >
      {item.icon}
    </NavLink>
  );
}

export function IconRail() {
  const { circle, viewingId, viewingSelf } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  // Viewing your own book shows everything; viewing someone else's only
  // shows the modules they've opted into sharing with their circle.
  const viewedPerson = viewingSelf ? null : circle.viewable.find((p) => String(p.id) === String(viewingId));
  const items = viewingSelf
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => !item.key || viewedPerson?.sharedModules?.includes(item.key));

  const activeTo = moduleForPath(pathname)?.to;

  function toggle(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  return (
    <nav className="icon-rail">
      <div className="mark">N</div>

      {items.filter((i) => !i.group).map((item) => <RailLink key={item.to} item={item} />)}

      {NAV_GROUPS.map((g) => {
        const groupItems = items.filter((i) => i.group === g.id);
        if (groupItems.length === 0) return null;
        const isCollapsed = collapsed.has(g.id);
        // A folded category still shows the page you're on, so you never
        // lose track of where you are.
        const visible = isCollapsed ? groupItems.filter((i) => i.to === activeTo) : groupItems;
        return (
          <div key={g.id} className={'rail-group' + (isCollapsed ? ' collapsed' : '')}>
            <button
              type="button"
              className="rail-group-h"
              onClick={() => toggle(g.id)}
              aria-expanded={!isCollapsed}
              title={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.label}`}
            >
              <span className="rail-chev" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
              {g.short}
              {isCollapsed && <span className="rail-count">{groupItems.length}</span>}
            </button>
            {visible.map((item) => <RailLink key={item.to} item={item} />)}
          </div>
        );
      })}

      <div className="spacer" />
      <NavLink to="/circle" title="Circle & personnel">☺</NavLink>
      <NavLink to="/settings" title="Settings">⚙</NavLink>
    </nav>
  );
}
