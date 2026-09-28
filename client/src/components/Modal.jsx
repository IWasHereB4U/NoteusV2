import { useState } from 'react';

// Free-form color field: a few quick presets, a native color picker (the
// browser's own palette, so "free" isn't limited to a fixed swatch set),
// a hex input for typing/pasting a value, and — where the browser supports
// it — an eyedropper that samples a color from anywhere on screen (any
// window, not just this page).
function ColorPickerField({ value, onChange, presets = [] }) {
  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const [picking, setPicking] = useState(false);

  async function pickFromScreen() {
    setPicking(true);
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) onChange(result.sRGBHex);
    } catch {
      // User cancelled (Esc/click-away) — nothing to do.
    } finally {
      setPicking(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {presets.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => onChange(val)}
              title={val}
              style={{
                width: 26, height: 26, borderRadius: '50%', background: val, cursor: 'pointer',
                border: value === val ? '2px solid var(--ink)' : '2px solid transparent',
                boxShadow: '0 0 0 1px var(--line2)',
              }}
            />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#0E9C92'}
          onChange={(e) => onChange(e.target.value)}
          title="Pick any color"
          style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        />
        <input
          className="field sm"
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          style={{ width: 100 }}
        />
        {supportsEyeDropper ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={pickFromScreen}
            disabled={picking}
            title="Sample a color from anywhere on your screen"
          >
            💧 {picking ? 'Pick a pixel…' : 'Eyedropper'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--ink3)' }} title="Your browser doesn't support the screen eyedropper (EyeDropper API)">
            Eyedropper unsupported here
          </span>
        )}
      </div>
    </div>
  );
}

// `width` widens the dialog for list-style modals (the default 520px suits
// a short form).
export function Modal({ title, onClose, children, footer, width }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

// Renders a form from a small field spec, mirroring the original app's
// declarative `form()` helper: [{k,label,type,options,value,half}]
export function FormModal({ title, fields, initial = {}, onSubmit, onClose, submitLabel = 'Save' }) {
  const [values, setValues] = useState(() => {
    const v = {};
    fields.forEach((f) => (v[f.k] = initial[f.k] ?? f.value ?? ''));
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, val) {
    setValues((v) => ({ ...v, [k]: val }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn" form="modal-form" disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <form id="modal-form" onSubmit={submit}>
        <div className="field-grid">
          {fields.map((f) => (
            <div
              key={f.k}
              className="field-row"
              style={{ gridColumn: f.half ? 'span 1' : 'span 2' }}
            >
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select
                  className="field"
                  value={values[f.k]}
                  onChange={(e) => set(f.k, e.target.value)}
                >
                  {f.options.map(([val, lab]) => (
                    <option key={val} value={val}>{lab}</option>
                  ))}
                </select>
              ) : f.type === 'swatches' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {f.options.map(([val]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set(f.k, val)}
                      title={val}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: val, cursor: 'pointer',
                        border: values[f.k] === val ? '2px solid var(--ink)' : '2px solid transparent',
                        boxShadow: '0 0 0 1px var(--line2)',
                      }}
                    />
                  ))}
                </div>
              ) : f.type === 'colorpicker' ? (
                <ColorPickerField
                  value={values[f.k]}
                  onChange={(val) => set(f.k, val)}
                  presets={(f.options || []).map(([val]) => val)}
                />
              ) : f.type === 'textarea' ? (
                <textarea
                  className="field"
                  value={values[f.k]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.k, e.target.value)}
                />
              ) : (
                <input
                  className="field"
                  type={f.type || 'text'}
                  step={f.type === 'number' ? '0.01' : undefined}
                  value={values[f.k]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.k, e.target.value)}
                  required={f.required}
                />
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
