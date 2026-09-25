import { useState } from 'react';
import { Modal } from '../Modal.jsx';

export function PasswordPrompt({ title, confirmLabel = 'Unlock', onSubmit, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn" form="pw-form" disabled={busy}>{busy ? 'Checking…' : confirmLabel}</button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="pw-form" onSubmit={submit}>
        <div className="field-row">
          <label>Password</label>
          <input
            className="field"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
