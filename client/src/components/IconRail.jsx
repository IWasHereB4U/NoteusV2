import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { NAV_ITEMS } from '../moduleNav.js';

export function IconRail() {
  const { circle, viewingId, viewingSelf } = useAuth();
  // Viewing your own book shows everything; viewing someone else's only
  // shows the modules they've opted into sharing with their circle.
  const viewedPerson = viewingSelf ? null : circle.viewable.find((p) => String(p.id) === String(viewingId));
  const items = viewingSelf
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => !item.key || viewedPerson?.sharedModules?.includes(item.key));

  return (
    <nav className="icon-rail">
      <div className="mark">N</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? 'on' : '')}
          title={item.label}
        >
          {item.icon}
        </NavLink>
      ))}
      <div className="spacer" />
      <NavLink to="/circle" title="Circle & personnel">☺</NavLink>
      <NavLink to="/settings" title="Settings">⚙</NavLink>
    </nav>
  );
}