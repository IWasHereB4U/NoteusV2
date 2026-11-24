import { useMemo, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { filesApi, fmtSize, fileSrc, fileDownload, KIND_ICON } from '../api/files.js';

const KINDS = [
  ['all', 'All'],
  ['image', 'Pictures'],
  ['document', 'Documents'],
  ['video', 'Video'],
  ['audio', 'Audio'],
  ['other', 'Other'],
];

export function Files() {
  const { items, loading, reload, viewingId } = useResource('/files');
  // Used only to say which tasks a file is attached to (empty if tasks aren't shared with you).
  const { items: tasks, reload: reloadTasks } = useResource('/tasks');
  const { viewingSelf } = useAuth();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const va = viewingId || undefined;

  const usage = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      for (const a of t.attachments || []) {
        if (!m.has(a.fileId)) m.set(a.fileId, []);
        m.get(a.fileId).push(t.title);
      }
    }
    return m;
  }, [tasks]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((f) => (kind === 'all' || f.kind === kind) && (!needle || f.originalName.toLowerCase().includes(needle)));
  }, [items, q, kind]);

  const totalSize = useMemo(() => items.reduce((s, f) => s + (f.size || 0), 0), [items]);

  async function upload(fileList) {
    const files = [...(fileList || [])];
    if (!files.length || !viewingSelf) return;
    setError('');
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await filesApi.upload(files[i], va);
      } catch (err) {
        failed.push(`${files[i].name}: ${err.message}`);
      }
    }
    setBusy('');
    if (failed.length) setError(failed.join(' · '));
    await reload();
  }

  async function rename(f) {
    const name = prompt('Rename file', f.originalName);
    if (name == null || !name.trim() || name.trim() === f.originalName) return;
    try {
      await filesApi.rename(f._id, name.trim(), va);
      await Promise.all([reload(), reloadTasks()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(f) {
    const used = usage.get(String(f._id)) || [];
    const msg = used.length
      ? `Delete "${f.originalName}"?\n\nIt is attached to ${used.length} task${used.length === 1 ? '' : 's'} (${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''}) and will be removed from ${used.length === 1 ? 'it' : 'them'}.`
      : `Delete "${f.originalName}"?`;
    if (!confirm(msg)) return;
    try {
      await filesApi.remove(f._id, va);
      await Promise.all([reload(), reloadTasks()]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow">Storage</div><h1>File repository</h1></div>
        {viewingSelf && (
          <>
            <button className="btn" onClick={() => inputRef.current?.click()} disabled={!!busy}>{busy || 'Upload files'}</button>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>

      {error && <div className="auth-error">{error}</div>}

      {viewingSelf && (
        <div
          className={`file-drop${over ? ' over' : ''}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        >
          Drop files here to upload — any type, up to 50 MB each. Attach them to tasks from the task editor.
        </div>
      )}

      <div className="files-toolbar">
        <input className="field" style={{ maxWidth: 260 }} placeholder="Search by file name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {KINDS.map(([k, label]) => (
          <button key={k} className={`btn sm ${kind === k ? '' : 'ghost'}`} onClick={() => setKind(k)}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>
          {items.length} file{items.length === 1 ? '' : 's'} · {fmtSize(totalSize)}
        </span>
      </div>

      <div className="card">
        {shown.length === 0 ? (
          <div className="empty">
            <b>{loading ? 'Loading…' : items.length ? 'No files match' : 'No files yet'}</b>
            {!loading && !items.length && 'Upload a picture or document to keep it here and attach it to tasks.'}
          </div>
        ) : (
          <div className="files-grid">
            {shown.map((f) => {
              const used = usage.get(String(f._id)) || [];
              return (
                <div key={f._id} className="file-card">
                  <div className="file-preview">
                    {f.kind === 'image' ? (
                      <a href={fileSrc(f)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
                        <img src={fileSrc(f)} alt={f.originalName} loading="lazy" />
                      </a>
                    ) : f.kind === 'video' ? (
                      <video src={fileSrc(f)} muted preload="metadata" />
                    ) : (
                      <span>{KIND_ICON[f.kind] || KIND_ICON.other}</span>
                    )}
                  </div>
                  <div className="file-meta">
                    <div className="file-name" title={f.originalName}>{f.originalName}</div>
                    <div className="file-sub">
                      {fmtSize(f.size)} · {new Date(f.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {used.length > 0 && (
                      <div className="file-sub" title={used.join(', ')}>📎 on {used.length} task{used.length === 1 ? '' : 's'}</div>
                    )}
                  </div>
                  <div className="file-actions">
                    <a className="btn ghost sm" href={fileDownload(f)} title="Download">↓ Download</a>
                    {viewingSelf && (
                      <>
                        <button className="btn ghost sm" onClick={() => rename(f)}>Rename</button>
                        <button className="btn danger sm" onClick={() => remove(f)}>×</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
