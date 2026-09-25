import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { KpiStrip } from '../components/KpiStrip.jsx';

function fm(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

export function Dashboard() {
  const { viewingId, viewingSelf, user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    const va = viewingId || undefined;
    Promise.all([
      api.get('/transactions', va),
      api.get('/tasks', va),
      api.get('/invoices', va),
      api.get('/filings', va),
    ]).then(([tx, tasks, invoices, filings]) => setData({ tx, tasks, invoices, filings }));
  }, [viewingId]);

  if (!data) return <main className="page">Loading…</main>;

  const income = data.tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = data.tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const openTasks = data.tasks.filter((t) => !t.done).length;
  const outstandingInvoices = data.invoices.filter((i) => i.status !== 'paid').length;
  const filingsDue = data.filings.filter((f) => f.status !== 'filed').length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>{viewingSelf ? `Hi, ${user?.name?.split(' ')[0]}` : 'Overview'}</h1>
        </div>
      </div>

      <KpiStrip
        items={[
          { label: 'Income', value: fm(income), cls: 'in' },
          { label: 'Expenses', value: fm(expense), cls: 'out' },
          { label: 'Net', value: fm(income - expense) },
          { label: 'Open tasks', value: openTasks, cls: 'info' },
        ]}
      />

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-h"><h2>Invoices</h2></div>
          <div className="card-b">
            <p style={{ margin: 0, color: 'var(--ink2)' }}>
              {outstandingInvoices === 0 ? 'Nothing outstanding.' : `${outstandingInvoices} invoice(s) not yet paid.`}
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
