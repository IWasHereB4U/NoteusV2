import { useState } from 'react';
import { api } from '../api/client.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormModal } from '../components/Modal.jsx';

function fm(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

function itemsToText(items = []) {
  return items.map((i) => `${i.desc} , ${i.qty} , ${i.rate}`).join('\n');
}
function textToItems(text = '') {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [desc, qty, rate] = l.split(',').map((s) => s.trim());
      return { desc, qty: Number(qty) || 0, rate: Number(rate) || 0 };
    });
}
function total(items = []) {
  return items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0);
}

const FIELDS = [
  { k: 'number', label: 'Invoice #', required: true, half: true },
  { k: 'status', label: 'Status', type: 'select', options: [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid'], ['overdue', 'Overdue']], half: true },
  { k: 'issueDate', label: 'Issue date', type: 'date', half: true },
  { k: 'dueDate', label: 'Due date', type: 'date', half: true },
  { k: 'itemsText', label: 'Line items — one per line: description, qty, rate', type: 'textarea' },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];

export function Invoices() {
  const { items, reload, viewingId } = useResource('/invoices');
  const { viewingSelf } = useAuth();
  const [editing, setEditing] = useState(null);

  async function save(values) {
    const payload = { ...values, items: textToItems(values.itemsText) };
    delete payload.itemsText;
    if (editing?._id) await api.put(`/invoices/${editing._id}`, payload, viewingId || undefined);
    else await api.post('/invoices', payload, viewingId || undefined);
    await reload();
  }

  async function remove(id) {
    if (!confirm('Delete this invoice?')) return;
    await api.del(`/invoices/${id}`, viewingId || undefined);
    reload();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Billing</div><h1>Invoices</h1></div>
        {viewingSelf && <button className="btn" onClick={() => setEditing({ status: 'draft' })}>New invoice</button>}
      </div>

      <div className="card">
        <div className="card-h"><h2>All invoices</h2></div>
        {items.length === 0 ? (
          <div className="empty"><b>No invoices yet</b>Create one to bill a client.</div>
        ) : (
          <div className="stack">
            {items.map((inv) => (
              <div key={inv._id} className="row">
                <div className="d">{inv.number}</div>
                <div>{inv.issueDate} → {inv.dueDate}</div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fm(total(inv.items))}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`tag ${inv.status === 'paid' ? 'green' : inv.status === 'overdue' ? 'rose' : 'ochre'}`}>{inv.status}</span>
                  {viewingSelf && (
                    <>
                      <button className="btn ghost sm" onClick={() => setEditing({ ...inv, itemsText: itemsToText(inv.items) })}>Edit</button>
                      <button className="btn danger sm" onClick={() => remove(inv._id)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing._id ? 'Edit invoice' : 'New invoice'}
          fields={FIELDS}
          initial={editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
