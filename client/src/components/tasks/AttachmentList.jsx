import { fileSrc, fileDownload, fmtSize, KIND_ICON, attachmentAsFile } from '../../api/files.js';

// Pictures as small thumbnails (click to open full size), everything else as a
// file chip (click to download). Used in the task list and in the task editor.
// `onRemove(attachment)` adds a × button (editor only).
export function AttachmentList({ items = [], onRemove }) {
  if (!items.length) return null;
  return (
    <div className="attach-list">
      {items.map((a) => {
        const f = attachmentAsFile(a);
        const remove = onRemove && (
          <button type="button" className="attach-x" onClick={() => onRemove(a)} title="Remove from task" aria-label={`Remove ${a.name}`}>×</button>
        );
        if (a.kind === 'image') {
          return (
            <span key={a.id} className="attach-thumb-wrap">
              <a href={fileSrc(f)} target="_blank" rel="noopener noreferrer" title={a.name}>
                <img className="attach-thumb" src={fileSrc(f)} alt={a.name} loading="lazy" />
              </a>
              {remove}
            </span>
          );
        }
        return (
          <span key={a.id} className="attach-chip-wrap">
            <a className="attach-chip" href={fileDownload(f)} title={`Download ${a.name}`}>
              <span>{KIND_ICON[a.kind] || KIND_ICON.other}</span>
              <span className="attach-chip-name">{a.name}</span>
              <span className="attach-chip-size">{fmtSize(a.size)}</span>
            </a>
            {remove}
          </span>
        );
      })}
    </div>
  );
}
