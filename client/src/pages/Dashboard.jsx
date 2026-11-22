import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { KpiStrip } from '../components/KpiStrip.jsx';

function fm(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

const HIDDEN = '₱ ••••••';

export function Dashboard() {
  const { viewingId, viewingSelf, user } = useAuth();
  const [data, setData] = useState(null);
  // Money figures start hidden; the person can reveal them with the toggle.
  const [showMoney, setShowMoney] = useState(false);

  useEffect(() => {
    const va = viewingId || undefined;
    Promise.all([
      api.get('/transactions', va),
      api.get('/tasks', va),
      // MGOctaviano07Oct2026: was /invoices. Tolerate a 403 (module not shared) so the dashboard still loads.
      api.get('/project-timelines', va).catch(() => []),
      api.get('/filings', va),
    ]).then(([tx, tasks, projects, filings]) => setData({ tx, tasks, projects, filings }));
  }, [viewingId]);

  if (!data) return <main className="page">Loading…</main>;

  const income = data.tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = data.tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const openTasks = data.tasks.filter((t) => !t.done).length;
  // MGOctaviano07Oct2026: replaces the invoices summary. A project is "open" until every phase has a finished date.
  const todayISO = new Date().toISOString().slice(0, 10);
  const openProjects = data.projects.filter((p) => (p.phases || []).some((ph) => !ph.finishedDate));
  const overdueProjects = openProjects.filter((p) =>
    (p.phases || []).some((ph) => !ph.finishedDate && ph.deadlineDate && ph.deadlineDate < todayISO)
  ).length;
  const filingsDue = data.filings.filter((f) => f.status !== 'filed').length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>{viewingSelf ? `Hi, ${user?.name?.split(' ')[0]}` : 'Overview'}</h1>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setShowMoney((v) => !v)}
          aria-pressed={showMoney}
        >
          {showMoney ? 'Hide amounts' : 'Show amounts'}
        </button>
      </div>

      <KpiStrip
        items={[
          { label: 'Income', value: showMoney ? fm(income) : HIDDEN, cls: 'in' },
          { label: 'Expenses', value: showMoney ? fm(expense) : HIDDEN, cls: 'out' },
          { label: 'Net', value: showMoney ? fm(income - expense) : HIDDEN },
          { label: 'Open tasks', value: openTasks, cls: 'info' },
        ]}
      />

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-h"><h2>Project Timeline</h2></div>
          <div className="card-b">
            <p style={{ margin: 0, color: 'var(--ink2)' }}>
              {openProjects.length === 0
                ? 'No open projects.'
                : `${openProjects.length} open project(s)${overdueProjects ? `, ${overdueProjects} past deadline` : ''}.`}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Filing desk</h2></div>
          <div className="card-b">
            <p style={{ margin: 0, color: 'var(--ink2)' }}>
              {filingsDue === 0 ? 'Nothing due.' : `${filingsDue} form(s) still to file.`}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}