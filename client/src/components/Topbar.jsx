import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ShadePicker } from './ShadePicker.jsx';
import { moduleForPath } from '../moduleNav.js';

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function Topbar() {
  const { user, circle, viewingId, setViewingId, viewingSelf, logout } = useAuth();
  const location = useLocation();
  const viewingUser = circle.viewable.find((v) => v.id === viewingId);
  // Whatever module the current page belongs to (null for Dashboard,
  // Circle, Settings — those aren't gated). A person is un-clickable from
  // here while you're on a module they haven't shared with you, rather
  // than switching to them and landing on a page you can't actually see.
  const currentModule = moduleForPath(location.pathname);

  return (
    <header className="topbar">
      <div className="roster">
        <span className="roster-label">Circle</span>
        {circle.viewable.map((person) => {
          const blocked = !person.self && currentModule?.key && !person.sharedModules?.includes(currentModule.key);
          return (
            <div
              key={person.id}
              className={`chip-avatar ${(!viewingId && person.self) || viewingId === person.id ? 'on' : ''}`}
              style={{
                background: person.color || '#0E9C92',
                opacity: blocked ? 0.35 : 1,
                cursor: blocked ? 'not-allowed' : 'pointer',
              }}
              title={
                blocked
                  ? `${person.name} hasn't shared ${currentModule.label} with you`
                  : person.self ? `${person.name} (you)` : person.name
              }
              onClick={() => {
                if (blocked) return;
                setViewingId(person.self ? null : person.id);
              }}
            >
              {initials(person.name)}
            </div>
          );
        })}
        {circle.pending.length > 0 && (
          <span className="viewer-note">· {circle.pending.length} invite pending</span>
        )}
      </div>

      <div className="viewer-note">
        {viewingSelf ? (
          <span>Viewing <b>your</b> book</span>
        ) : (
          <span>Viewing <b>{viewingUser?.name}</b>'s book · read-only</span>
        )}
      </div>

      <div className="topbar-actions">
        <ShadePicker />
        <span className="viewer-note">{user?.name}</span>
        <button className="btn ghost sm" onClick={logout}>Log out</button>
      </div>
    </header>
  );
}