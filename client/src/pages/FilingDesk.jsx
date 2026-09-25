import { useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

function fm(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}
function daysFrom(dateStr) {
  return Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
}

const NEW_FIELDS = [
  { k: 'form', label: 'Form', required: true, half: true },
  { k: 'label', label: 'Label', half: true },
  { k: 'due', label: 'Due date', type: 'date', required: true },
];
const FILE_FIELDS = [
  { k: 'filedOn', label: 'Filed on', type: 'date', half: true },
  { k: 'amountPaid', label: 'Amount paid', type: 'number', half: true },
  { k: 'ref', label: 'Confirmation / reference number' },
];

export function FilingDesk() {
  const { items, reload, viewingId } = useResource('/filings');
  const { viewingSelf } = useAuth();
  const [creating, setCreating] = useState(false);
  const [filing, setFiling] = useState(null);

  async function createPack(values) {
    await api.post('/filings', values, viewingId || undefined);
    reload();
  }

  async function markFiled(values) {
    await api.put(`/filings/${filing._id}`, { ...values, status: 'filed' }, viewingId || undefined);
    reload();
  }

  async function reopen(f) {
    await api.put(`/filings/${f._id}`, { status: 'ready' }, viewingId || undefined);
    reload();
  }

  async function dismiss(id) {
    if (!confirm('Remove this pack from the desk?')) return;
    await api.del(`/filings/${id}`, viewingId || undefined);
    reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Compliance</div><h1>Filing desk</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setCreating(true)}>Add filing</button>}
      </div>

      <div className="card">
        <div className="card-h"><h2>Filing packs</h2></div>
        {items.length === 0 ? (
          <div className="empty"><b>Nothing to prepare yet</b>Add a form and its due date to start tracking it.</div>
        ) : (
          <div className="stack">
            {items.map((f) => {
              const d = daysFrom(f.due);
              const late = d < 0 && f.status !== 'filed';
              return (
                <div key={f._id} className="row" style={{ cursor: 'pointer' }} onClick={() => viewingSelf && setFiling(f)}>
                  <div className="d">{f.due}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>Form {f.form} · {f.label}</div>
                    <div style={{ fontSize: 12, color: late ? 'var(--coral)' : 'var(--ink3)' }}>
                      {f.status === 'filed' ? `filed ${f.filedOn}` : late ? `${-d} days late` : d === 0 ? 'due today' : `due in ${d} days`}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fm(f.amountPaid || 0)}</div>
                  <span className={`tag ${f.status === 'filed' ? 'green' : late ? 'rose' : 'ochre'}`}>{f.status === 'filed' ? 'filed' : 'ready'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <FormModal title="Add filing" fields={NEW_FIELDS} onSubmit={createPack} onClose={() => setCreating(false)} />
      )}

      {filing && (
        <FormModal
          title={`Form ${filing.form} · ${filing.label || ''}`}
          fields={FILE_FIELDS}
          initial={{ filedOn: new Date().toISOString().slice(0, 10) }}
          submitLabel={filing.status === 'filed' ? 'Update record' : 'Mark as filed'}
          onSubmit={markFiled}
          onClose={() => setFiling(null)}
        />
      )}
    </main>
  );
}
