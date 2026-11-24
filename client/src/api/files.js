import { api, mediaUrl } from './client.js';

// File repository client + small helpers shared by the Files page, the task
// editor and the task list.
export const filesApi = {
  list: (viewAs) => api.get('/files', viewAs),
  upload: (file, viewAs) => api.upload('/files/upload', file, viewAs),
  rename: (id, originalName, viewAs) => api.put(`/files/${id}`, { originalName }, viewAs),
  remove: (id, viewAs) => api.del(`/files/${id}`, viewAs),
};

export function fmtSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const KIND_ICON = { image: '🖼️', video: '🎞️', audio: '🎵', document: '📄', other: '📎' };

// Inline view (images, video, pdf) — the plain /uploads URL.
export const fileSrc = (f) => mediaUrl(f.url);

// Download with the real file name: /uploads/<stored-name>/<original-name>.
export const fileDownload = (f) => mediaUrl(`${f.url}/${encodeURIComponent(f.originalName || f.name || 'file')}`);

// A repository entry -> the compact copy a task keeps.
export function toAttachment(f) {
  return {
    id: `${f._id}-${Math.random().toString(36).slice(2, 7)}`,
    fileId: String(f._id),
    name: f.originalName,
    url: f.url,
    mimeType: f.mimeType,
    kind: f.kind,
    size: f.size,
  };
}

// A task attachment shaped like a repository entry, so the helpers above work on both.
export const attachmentAsFile = (a) => ({ ...a, originalName: a.name });
