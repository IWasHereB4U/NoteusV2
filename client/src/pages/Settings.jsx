import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Name + email. Its own card/save cycle, separate from business details
// and from the password form below, so one failing doesn't block another.
function AccountCard() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | saved

  async function save(e) {
    e.preventDefault();
    setError('');
    setStatus('saving');
    try {
      await updateProfile(form);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="card-h"><h2>Account</h2></div>
      <div className="card-b">
        {error && <div className="auth-error">{error}</div>}
        <div className="field-grid">
          <div className="field-row">
            <label>Name</label>
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>Email</label>
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
        </div>
      </div>
      <div className="modal-f">
        <button className="btn" disabled={status === 'saving'}>
          {status === 'saved' ? 'Saved ✓' : status === 'saving' ? 'Saving…' : 'Save account'}
        </button>
      </div>
    </form>
  );
}

// Change password: requires the current password, plus a client-side
// confirm-match check before it ever hits the server.
function PasswordCard() {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');

  async function save(e) {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) {
      setError("New passwords don't match");
      return;
    }
    setStatus('saving');
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="card-h"><h2>Change password</h2></div>
      <div className="card-b">
        {error && <div className="auth-error">{error}</div>}
        <div className="field-grid">
          <div className="field-row" style={{ gridColumn: 'span 2' }}>
            <label>Current password</label>
            <input
              className="field"
              type="password"
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>New password</label>
            <input
              className="field"
              type="password"
              minLength={6}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>Confirm new password</label>
            <input
              className="field"
              type="password"
              minLength={6}
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
        </div>
      </div>
      <div className="modal-f">
        <button className="btn" disabled={status === 'saving'}>
          {status === 'saved' ? 'Saved ✓' : status === 'saving' ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

export function Settings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(setSettings);
  }, []);

  if (!settings) return <main className="page">Loading…</main>;

  const biz = settings.biz || {};

  function setBiz(k, v) {
    setSettings((s) => ({ ...s, biz: { ...s.biz, [k]: v } }));
  }

  async function save(e) {
    e.preventDefault();
    await api.put('/settings', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Your book</div><h1>Settings</h1></div>
      </div>

      <AccountCard />
      <PasswordCard />

      <form className="card" onSubmit={save}>
        <div className="card-h"><h2>Business details</h2></div>
        <div className="card-b">
          <div className="field-grid">
            <div className="field-row" style={{ gridColumn: 'span 2' }}>
              <label>Business name</label>
              <input className="field" value={biz.name || ''} onChange={(e) => setBiz('name', e.target.value)} />
            </div>
            <div className="field-row">
              <label>Email</label>
              <input className="field" value={biz.email || ''} onChange={(e) => setBiz('email', e.target.value)} />
            </div>
            <div className="field-row">
              <label>Phone</label>
              <input className="field" value={biz.phone || ''} onChange={(e) => setBiz('phone', e.target.value)} />
            </div>
            <div className="field-row">
              <label>TIN</label>
              <input className="field" value={biz.tin || ''} onChange={(e) => setBiz('tin', e.target.value)} />
            </div>
            <div className="field-row">
              <label>Currency symbol</label>
              <input className="field" value={settings.currency || '₱'} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))} />
            </div>
            <div className="field-row" style={{ gridColumn: 'span 2' }}>
              <label>Address</label>
              <textarea className="field" value={biz.address || ''} onChange={(e) => setBiz('address', e.target.value)} />
            </div>
            <div className="field-row" style={{ gridColumn: 'span 2' }}>
              <label>Payment instructions on invoices</label>
              <textarea className="field" value={biz.payTo || ''} onChange={(e) => setBiz('payTo', e.target.value)} />
            </div>
            <div className="field-row">
              <label>Invoice prefix</label>
              <input className="field" value={biz.prefix || ''} onChange={(e) => setBiz('prefix', e.target.value)} />
            </div>
            <div className="field-row">
              <label>Default payment terms (days)</label>
              <input className="field" type="number" value={biz.terms || 15} onChange={(e) => setBiz('terms', Number(e.target.value))} />
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn">{saved ? 'Saved ✓' : 'Save settings'}</button>
        </div>
      </form>
    </main>
  );
}