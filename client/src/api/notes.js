import { api, API_ORIGIN } from './client.js';

function authHeaders() {
  const token = localStorage.getItem('noteus_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const notesApi = {
  folders: (viewAs) => api.get('/note-folders', viewAs),
  createFolder: (body, viewAs) => api.post('/note-folders', body, viewAs),
  renameFolder: (id, body, viewAs) => api.put(`/note-folders/${id}`, body, viewAs),
  deleteFolder: (id, viewAs) => api.del(`/note-folders/${id}`, viewAs),
  unlockFolder: (id, password, viewAs) => api.post(`/note-folders/${id}/unlock`, { password }, viewAs),

  cards: (folderId, viewAs) => api.get(`/note-cards?folder=${folderId}`, viewAs),
  createCard: (body, viewAs) => api.post('/note-cards', body, viewAs),
  updateCard: (id, body, viewAs) => api.put(`/note-cards/${id}`, body, viewAs),
  deleteCard: (id, viewAs) => api.del(`/note-cards/${id}`, viewAs),
  getCard: (id, viewAs) => api.get(`/note-cards/${id}`, viewAs),
  // Comments only — used by the editor's poll so it doesn't re-download
  // the whole note body every time.
  getComments: (id, viewAs) => api.get(`/note-cards/${id}/comments`, viewAs),

  addComment: (cardId, body, viewAs) => api.post(`/note-cards/${cardId}/comments`, body, viewAs),
  updateComment: (cardId, commentId, body, viewAs) => api.put(`/note-cards/${cardId}/comments/${commentId}`, body, viewAs),
  deleteComment: (cardId, commentId, viewAs) => api.del(`/note-cards/${cardId}/comments/${commentId}`, viewAs),

  mediaList: (viewAs) => api.get('/media', viewAs),
  deleteMedia: (id, viewAs) => api.del(`/media/${id}`, viewAs),

  // multipart upload can't go through the JSON-only api client
  async uploadMedia(file, viewAs) {
    const url = new URL(API_ORIGIN + '/api/media/upload', window.location.origin);
    if (viewAs) url.searchParams.set('viewAs', viewAs);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
};
