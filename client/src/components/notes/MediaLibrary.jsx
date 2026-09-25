import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal.jsx';
import { notesApi } from '../../api/notes.js';
import { mediaUrl } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

function fmtSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// onSelect(asset) is called when the caller wants to insert a picked asset
// into whatever editor opened this (free canvas or fixed document). Pass
// null if this is being opened purely to manage the library.
export function MediaLibrary({ onSelect, onClose }) {
  const { viewingId } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setAssets(await notesApi.mediaList(viewingId || undefined));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await notesApi.uploadMedia(file, viewingId || undefined);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function remove(id) {
    if (!confirm('Delete this file? Any card using it will show a broken reference.')) return;
    await notesApi.deleteMedia(id, viewingId || undefined);
    load();
  }

  return (
    <Modal title="Media library" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Images and videos, shared across every folder and card.</span>
        <button className="btn sm" onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleUpload} />
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="empty"><b>Nothing uploaded yet</b>Upload an image or video to use it in your notes.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {assets.map((a) => (
            <div key={a._id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ aspectRatio: '1', background: 'var(--sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {a.kind === 'image' ? (
                  <img src={mediaUrl(a.url)} alt={a.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <video src={mediaUrl(a.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                )}
              </div>
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.originalName}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginBottom: 6 }}>{fmtSize(a.size)}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {onSelect && (
                    <button className="btn sm" style={{ flex: 1 }} onClick={() => onSelect(a)}>Insert</button>
                  )}
                  <a className="btn ghost sm" href={mediaUrl(a.url)} download={a.originalName}>↓</a>
                  <button className="btn danger sm" onClick={() => remove(a._id)}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
