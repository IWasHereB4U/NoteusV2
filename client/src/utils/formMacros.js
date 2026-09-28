// Talks to the Form Macros browser extension through its page bridge
// (bridge.js in the extension). Messages go over window.postMessage; the
// extension asks the user once before it lets this site send or read macros.

const STEP_KINDS = ['click', 'fill', 'select', 'check', 'key', 'waitFor', 'wait'];

function request(action, payload = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('The Form Macros extension did not respond'));
    }, timeout);
    function onMessage(e) {
      if (e.source !== window || e.data?.__formMacros !== 'response' || e.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      const { __formMacros, id: _id, ...res } = e.data;
      res.ok ? resolve(res) : reject(new Error(res.error || 'Extension request failed'));
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ __formMacros: 'request', id, action, ...payload }, window.location.origin);
  });
}

// Resolves to the extension's version string, or null when it isn't installed.
export async function detectExtension() {
  if (document.documentElement.dataset.formMacros) return document.documentElement.dataset.formMacros;
  try {
    const res = await request('ping', {}, 800);
    return res.version || null;
  } catch {
    return null;
  }
}

// Every macro list on the page shares one detection instead of pinging per task.
let detection = null;
export function detectExtensionOnce() {
  if (!detection) detection = detectExtension();
  return detection;
}

export function sendToExtension(macros) {
  return request('import', { macros: macros.map(toPlain) }, 60000); // long timeout: user may be reading the confirm dialog
}

export async function listExtensionMacros() {
  const res = await request('list', {}, 60000);
  return (res.macros || []).map(sanitizeMacro).filter(Boolean);
}

export function sanitizeMacro(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.steps)) return null;
  return {
    name: String(m.name || 'Imported').slice(0, 200),
    match: String(m.match || '*').slice(0, 500),
    note: String(m.note || ''),
    steps: m.steps
      .filter((s) => s && STEP_KINDS.includes(s.type))
      .map((s) => ({
        type: s.type,
        selector: String(s.selector || ''),
        value: String(s.value ?? ''),
        // Manual steps pause the macro and ask for the value in a popup;
        // labelSelector points at the text shown as that popup's heading.
        ...(s.manual ? { manual: true } : {}),
        ...(s.manual && s.labelSelector ? { labelSelector: String(s.labelSelector) } : {}),
      })),
  };
}

// Accepts the extension's single-macro file, its bundle file, a bare array, or a bare macro.
export function macrosFromFile(data) {
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.macros)) list = data.macros;
  else if (data && data.macro) list = [data.macro];
  else list = [data];
  return list.map(sanitizeMacro).filter(Boolean);
}

export function toPlain(m) {
  return { name: m.name, match: m.match, steps: m.steps };
}

// Copy for a task created from an instance: same macros, fresh ids.
export function cloneMacros(list = [], makeId) {
  return list.map((m) => ({ ...toPlain(m), id: makeId() }));
}

export function downloadMacro(m) {
  const body = JSON.stringify({ kind: 'form-macro', version: 1, macro: toPlain(m) }, null, 2);
  const slug = String(m.name || 'macro').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'macro';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `${slug}.formmacro.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
