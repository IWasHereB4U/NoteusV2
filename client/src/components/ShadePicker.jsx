import { useRef, useState } from 'react';
import { useShade, ACCENT_PRESETS } from '../context/ShadeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function ShadePicker() {
  const { mode, setMode } = useShade();
  const { user, updateColor } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef(null);

  async function pick(color) {
    if (color === user?.color) return;
    setSaving(true);
    try {
      await updateColor(color);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        className="btn ghost sm"
        onClick={() => setOpen((o) => !o)}
        title="Shade — light/dark and your accent color"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span
          style={{ width: 12, height: 12, borderRadius: '50%', background: user?.color || 'var(--teal)', display: 'inline-block' }}
        />
        Shade
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card"
            style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 220, zIndex: 41, padding: 14 }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Shade
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button className={`btn sm ${mode === 'light' ? '' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setMode('light')}>
                ☀ Light
              </button>
              <button className={`btn sm ${mode === 'dark' ? '' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setMode('dark')}>
                ☾ Dark
              </button>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Your color
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 10 }}>
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => pick(c)}
                  disabled={saving}
                  title={c}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: user?.color === c ? '2px solid var(--ink)' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)' }}>
              Custom
              <input
                type="color"
                value={user?.color || '#0E9C92'}
                onChange={(e) => pick(e.target.value)}
                disabled={saving}
                style={{ width: 30, height: 22, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
