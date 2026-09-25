import { Outlet } from 'react-router-dom';
import { IconRail } from './IconRail.jsx';
import { Topbar } from './Topbar.jsx';
// Chibi companions strip — hidden for now, not removed. Re-enable by
// uncommenting the import and the <Yard /> line below.
// import { Yard } from './yard/Yard.jsx';

export function Layout() {
  return (
    <div className="app-shell">
      <IconRail />
      <div className="main-col">
        <Topbar />
        {/* <Yard /> */}
        <Outlet />
      </div>
    </div>
  );
}
