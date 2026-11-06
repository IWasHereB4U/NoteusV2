import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal, Modal } from '../components/Modal.jsx';

function fm(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-' : '') + '₱' + Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Local-date YYYY-MM-DD (not toISOString, which shifts to UTC and shows
// yesterday for part of every day in the Philippines).
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  if (!y) return s || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

const BANK_FIELDS = [{ k: 'name', label: 'Bank name', required: true, placeholder: 'e.g. BDO Savings' }];

// Newest date first; same-day entries fall back to when they were added.
function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

export function Bankbook() {
  const banksRes = useResource('/banks');
  const historyRes = useResource('/bank-histories');
  const { viewingSelf } = useAuth();
  const banks = banksRes.items;
  const history = historyRes.items;
  const as = banksRes.viewingId || undefined;

  const [bankForm, setBankForm] = useState(null); // null=closed, {}=new bank, {...}=rename
  const [historyForm, setHistoryForm] = useState(null); // null=closed, {bankId?}=new, {...}=edit
  const [openBankId, setOpenBankId] = useState(null); // bank whose history modal is open
  const [error, setError] = useState('');

  const byBank = useMemo(() => {
    const map = new Map();
    for (const h of history) {
      const key = String(h.bankId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(h);
    }
    for (const list of map.values()) list.sort(newestFirst);
    return map;
  }, [history]);

  const openBank = banks.find((b) => b._id === openBankId) || null;
  const openRows = openBank ? byBank.get(openBank._id) || [] : [];
  const loadError = banksRes.error || historyRes.error;

  async function saveBank(values) {
    const name = values.name.trim();
    if (bankForm?._id) await api.put(`/banks/${bankForm._id}`, { name }, as);
    else await api.post('/banks', { name }, as);
    await banksRes.reload();
  }

  async function saveHistory(values) {
    const body = { bankId: values.bankId, date: values.date, amount: Number(values.amount) };
    if (historyForm?._id) await api.put(`/bank-histories/${historyForm._id}`, body, as);
    else await api.post('/bank-histories', body, as);
    await historyRes.reload();
  }

  async function removeHistory(id) {
    if (!confirm('Remove this history entry?')) return;
    setError('');
    try {
      await api.del(`/bank-histories/${id}`, as);
      await historyRes.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeBank(bank) {
    const n = (byBank.get(bank._id) || []).length;
    const extra = n ? ` Its ${n} history ${n === 1 ? 'entry' : 'entries'} will be deleted too.` : '';
    if (!confirm(`Delete "${bank.name}"?${extra}`)) return;
    setError('');
    try {
      await api.del(`/banks/${bank._id}`, as);
      setOpenBankId(null);
      await Promise.all([banksRes.reload(), historyRes.reload()]);
    } catch (err) {
      setError(err.message);
    }
  }

  // The bank dropdown is built from the banks that exist right now; a new
  // entry defaults to the bank it was opened from (or the first bank), and
  // today's date.
  const historyFields = [
    {
      k: 'bankId',
      label: 'Bank',
      type: 'select',
      options: banks.map((b) => [b._id, b.name]),
      value: historyForm?.bankId || banks[0]?._id || '',
    },
    { k: 'date', label: 'Date', type: 'date', required: true, half: true, value: localISODate() },
    { k: 'amount', label: 'Amount', type: 'number', required: true, half: true },
  ];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Accounts</div>
          <h1>Bankbook</h1>
        </div>
        {viewingSelf && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => setBankForm({})}>Add new bank</button>
            <button
              className="btn"
              onClick={() => setHistoryForm({})}
              disabled={banks.length === 0}
              title={banks.length === 0 ? 'Add a bank first' : undefined}
            >
              Add new history
            </button>
          </div>
        )}
      </div>

      {(error || loadError) && <div className="auth-error">{error || loadError.message}</div>}

      {banks.length === 0 ? (
        <div className="card">
          <div className="empty"><b>No banks yet</b>Add a bank to start your bankbook.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {banks.map((b) => {
            const rows = byBank.get(b._id) || [];
            const latest = rows[0];
            const open = () => { setError(''); setOpenBankId(b._id); };
            return (
              <article
                key={b._id}
                className="tcard"
                role="button"
                tabIndex={0}
                title="View history"
                style={{ cursor: 'pointer' }}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                }}
              >
                <div className="tcard-top" style={{ gap: 8 }}>
                  <span className="tcard-name">{b.name}</span>
                  <span className="tcard-n">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                </div>
                <div className="tcard-price">{latest ? fm(latest.amount) : '—'}</div>
                <dl className="tcard-dl">
                  <dt>As of</dt>
                  <dd>{latest ? fmtDate(latest.date) : 'No history yet'}</dd>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      {openBank && (
        <Modal
          title={openBank.name}
          width={560}
          onClose={() => setOpenBankId(null)}
          footer={
            viewingSelf && (
              <>
                <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => removeBank(openBank)}>
                  Delete bank
                </button>
                <button className="btn ghost" onClick={() => setBankForm(openBank)}>Rename</button>
                <button className="btn" onClick={() => setHistoryForm({ bankId: openBank._id })}>Add history</button>
              </>
            )
          }
        >
          {error && <div className="auth-error">{error}</div>}
          {openRows.length === 0 ? (
            <div className="empty"><b>No history yet</b>Add an entry to start this bank's record.</div>
          ) : (
            <div className="stack">
              {openRows.map((h) => (
                <div key={h._id} className="row" style={{ gridTemplateColumns: '1fr auto auto', padding: '10px 0' }}>
                  <div className="d">{fmtDate(h.date)}</div>
                  <div style={{ fontWeight: 600 }}>{fm(h.amount)}</div>
                  {viewingSelf && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setHistoryForm(h)}>Edit</button>
                      <button className="btn danger sm" onClick={() => removeHistory(h._id)}>Remove</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {bankForm && (
        <FormModal
          title={bankForm._id ? 'Rename bank' : 'Add new bank'}
          fields={BANK_FIELDS}
          initial={bankForm}
          onSubmit={saveBank}
          onClose={() => setBankForm(null)}
        />
      )}

      {historyForm && (
        <FormModal
          title={historyForm._id ? 'Edit history' : 'Add new history'}
          fields={historyFields}
          initial={historyForm}
          onSubmit={saveHistory}
          onClose={() => setHistoryForm(null)}
        />
      )}
    </main>
  );
}
