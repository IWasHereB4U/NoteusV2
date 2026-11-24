import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { filesApi, fmtSize, KIND_ICON, fileSrc } from '../../api/files.js';

// Choose one or more files already in the file repository. Calls
// onPick(files[]) with the chosen repository entries.
export function FilePickerModal({ onPick, onClose, imagesOnly = false, excludeIds = [] }) {
  const { viewingId } = useAuth();
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState(() => new Set());

  useEffect(() => {
    filesApi.list(viewingId || undefined).then(setFiles).catch((e) => setError(e.message));
  }, [viewingId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (files || []).filter(
      (f) =>
        !excludeIds.includes(String(f._id)) &&
        (!imagesOnly || f.kind === 'image') &&
        (!needle || f.originalName.toLowerCase().includes(needle))
    );
  }, [files, q, imagesOnly, excludeIds]);

  const toggle = (id) =>
    setChosen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Modal
      title={imagesOnly ? 'Pick a picture from the repository' : 'Pick from the file repository'}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            type="button"
            disabled={!chosen.size}
            onClick={() => { onPick((files || []).filter((f) => chosen.has(String(f._id)))); onClose(); }}
          >
            Attach{chosen.size ? ` ${chosen.size}` : ''}
          </button>
        </>
      }
    >
      {error && <div className="auth-error">{error}</div>}
      <input className="field" placeholder="Search by file name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {files === null ? (
        <div className="empty">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty"><b>{files.length ? 'No matches' : 'Nothing in the repository yet'}</b>Upload files from the File repository page, or attach a new one straight from the task.</div>
      ) : (
        <div className="picker-list">
          {shown.map((f) => (
            <label key={f._id} className={`picker-row ${chosen.has(String(f._id)) ? 'on' : ''}`}>
              <input type="checkbox" checked={chosen.has(String(f._id))} onChange={() => toggle(String(f._id))} />
              {f.kind === 'image'
                ? <img className="picker-thumb" src={fileSrc(f)} alt="" loading="lazy" />
                : <span className="picker-icon">{KIND_ICON[f.kind] || KIND_ICON.other}</span>}
              <span className="picker-name">{f.originalName}</span>
              <span className="picker-size">{fmtSize(f.size)}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
