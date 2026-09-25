// When the client is deployed separately from the API (e.g. client on
// Vercel, server on Render/Railway/Fly), set VITE_API_URL to the server's
// origin. Left unset, everything stays relative — which is what local dev
// relies on via the Vite proxy in vite.config.js.
const API_ORIGIN = import.meta.env.VITE_API_URL || '';
const BASE = API_ORIGIN + '/api';

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function getToken() {
  return localStorage.getItem('noteus_token');
}

async function request(path, { method = 'GET', body, viewAs } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (viewAs) url.searchParams.set('viewAs', viewAs);

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  // A 401 from /auth/login or /auth/register just means "bad credentials" /
  // "email already taken" etc — there's no session to have expired yet.
  // Only treat 401 as an invalidated session for already-authenticated
  // requests, so we don't clobber the server's real error message (and
  // don't call onUnauthorized, which is meaningless pre-login anyway).
  const isAuthEntryPoint = path === '/auth/login' || path === '/auth/register';
  if (res.status === 401 && !isAuthEntryPoint) {
    onUnauthorized();
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: (path, viewAs) => request(path, { viewAs }),
  post: (path, body, viewAs) => request(path, { method: 'POST', body, viewAs }),
  put: (path, body, viewAs) => request(path, { method: 'PUT', body, viewAs }),
  del: (path, viewAs) => request(path, { method: 'DELETE', viewAs }),
};

export { API_ORIGIN };

// Server responses hand back server-relative paths for uploaded files
// (e.g. `/uploads/xyz.png`). Those only resolve correctly when the page
// and the API share an origin — once they don't, this stitches the API's
// origin back on. Absolute URLs pass through untouched.
export function mediaUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return API_ORIGIN + path;
}