import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Kept in sync with MODULE_KEYS on the server — there's no shared-package
// boundary between client and server here, so this list is duplicated
// deliberately rather than fetched.
const MODULES = [
  ['clients', 'Clients'],
  ['money', 'Money'],
  ['invoices', 'Invoices'],
  ['tasks', 'Tasks'],
  ['meetings', 'Meetings'],
  ['timesheet', 'Timesheet'],
  ['calendar', 'Calendar'],
  ['filing', 'Filing desk'],
  ['notes', 'Notes'],
  ['notetags', 'Note Tag'],
];

export function Circle() {
  const { circle, loadCircle, updateSharedModulesFor } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingFor, setSavingFor] = useState(null); // userId currently being saved

  async function invite(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/circle/invite', { email });
      setEmail('');
      await loadCircle();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(userId, accept) {
    await api.post('/auth/circle/respond', { userId, accept });
    await loadCircle();
  }

  async function remove(userId) {
    if (!confirm('Remove this person from your circle? They will no longer be able to view your book.')) return;
    await api.del(`/auth/circle/${userId}`);
    await loadCircle();
  }

  async function toggleModule(person, key) {
    const next = person.sharedModules.includes(key)
      ? person.sharedModules.filter((k) => k !== key)
      : [...person.sharedModules, key];
    setSavingFor(person.id);
    try {
      await updateSharedModulesFor(person.id, next);
    } finally {
      setSavingFor(null);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Personnel</div>
          <h1>Circle</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink2)', maxWidth: 560, marginTop: -8 }}>
        Everyone in your circle shows up in the roster strip at the top of the app, and can switch
        to view your book (read-only) from the person-switcher. Invites are mutual — once accepted,
        you can view each other. Below, choose which modules each person can see of your book —
        it's set individually per person, not shared by the whole circle at once.
      </p>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-h"><h2>Add someone to your circle</h2></div>
        <div className="card-b">
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={invite} style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              type="email"
              placeholder="Their account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Invite'}</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-h"><h2>What each person can see</h2></div>
        {circle.sharing.length === 0 ? (
          <div className="empty"><b>Just you, for now</b>Invite family or teammates to share viewing access.</div>
        ) : (
          <div className="stack">
            {circle.sharing.map((p) => (
              <div key={p.id} style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {savingFor === p.id && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Saving…</span>}
                    <button className="btn danger sm" onClick={() => remove(p.id)}>Remove</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {MODULES.map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={p.sharedModules.includes(key)}
                        onChange={() => toggleModule(p, key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {circle.pending.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h"><h2>Invites waiting on you</h2></div>
          <div className="stack">
            {circle.pending.map((p) => (
              <div key={p.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => respond(p.id, true)}>Accept</button>
                  <button className="btn ghost sm" onClick={() => respond(p.id, false)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {circle.outgoing.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h"><h2>Invites you've sent</h2></div>
          <div className="stack">
            {circle.outgoing.map((p) => (
              <div key={p.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="tag ochre">awaiting response</span>
                  <button className="btn ghost sm" onClick={() => remove(p.id)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}