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
  // Money stays hidden — and isn't even downloaded — until the person taps
  // "Show amounts". It hides again whenever the dashboard is reopened or the
  // person-switcher changes whose book is on screen.
  const [showMoney, setShowMoney] = useState(false);
  const [tx, setTx] = useState(null); // null = not loaded yet
  const [txError, setTxError] = useState(false);

  useEffect(() => {
    const va = viewingId || undefined;
    setShowMoney(false);
    setTx(null);
    setTxError(false);
    Promise.all([
      api.get('/tasks', va).catch(() => []),
      // MGOctaviano07Oct2026: was /invoices. Tolerate a 403 (module not shared) so the dashboard still loads.
      api.get('/project-timelines', va).catch(() => []),
      api.get('/filings', va).catch(() => []),
    ]).then(([tasks, projects, filings]) => setData({ tasks, projects, filings }));
  }, [viewingId]);

  // Fetch the transactions only the first time they are asked to be shown.
  useEffect(() => {
    if (!showMoney || tx !== null) return;
    api.get('/transactions', viewingId || undefined)
      .then(setTx)
      .catch(() => { setTx([]); setTxError(true); });
  }, [showMoney, tx, viewingId]);

  if (!data) return <main className="page">Loading…</main>;

  const txList = tx || [];
  const income = txList.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txList.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const moneyShown = showMoney && tx !== null && !txError;
  const moneyText = (v) => (showMoney && tx === null ? '₱ …' : moneyShown ? fm(v) : HIDDEN);
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
          { label: 'Income', value: moneyText(income), cls: 'in' },
          { label: 'Expenses', value: moneyText(expense), cls: 'out' },
          { label: 'Net', value: moneyText(income - expense) },
          { label: 'Open tasks', value: openTasks, cls: 'info' },
        ]}
      />

      {showMoney && txError && (
        <div className="auth-error">Couldn't load the amounts{viewingSelf ? '' : " — this person may not share Money with you"}.</div>
      )}

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