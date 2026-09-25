import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function Login() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="mark">N</div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your book'}</h1>
        <p className="sub">
          {mode === 'login'
            ? 'Sign in to your ledger. Idle for 30 minutes and you\'ll be signed out automatically.'
            : 'Set up your own NoteUs book, then invite family or teammates into your circle.'}
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field-row">
              <label>Name</label>
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div className="field-row">
            <label>Email</label>
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="field-row">
            <label>Password</label>
            <input
              className="field"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? (
            <>No book yet? <button onClick={() => setMode('register')}>Create one</button></>
          ) : (
            <>Already have a book? <button onClick={() => setMode('login')}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
