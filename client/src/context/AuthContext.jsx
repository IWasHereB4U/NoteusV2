import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';
import { useIdleTimer } from '../hooks/useIdleTimer.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [circle, setCircle] = useState({ viewable: [], pending: [], outgoing: [], sharing: [] });
  const [viewingId, setViewingId] = useState(null); // null = viewing yourself

  const logout = useCallback(() => {
    localStorage.removeItem('noteus_token');
    setUser(null);
    setCircle({ viewable: [], pending: [], outgoing: [], sharing: [] });
    setViewingId(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const loadCircle = useCallback(async () => {
    try {
      const data = await api.get('/auth/circle');
      setCircle(data);
    } catch {
      /* not fatal */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('noteus_token');
      if (!token) return setBooting(false);
      try {
        const { user } = await api.get('/auth/me');
        setUser(user);
        await loadCircle();
      } catch {
        logout();
      } finally {
        setBooting(false);
      }
    })();
  }, [loadCircle, logout]);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    localStorage.setItem('noteus_token', token);
    setUser(user);
    await loadCircle();
  }

  async function register(name, email, password) {
    const { token, user } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('noteus_token', token);
    setUser(user);
    await loadCircle();
  }

  async function refreshToken() {
    if (!localStorage.getItem('noteus_token')) return;
    try {
      const { token } = await api.post('/auth/refresh', {});
      localStorage.setItem('noteus_token', token);
    } catch {
      /* if this fails, the idle timer or next request will catch it */
    }
  }

  // The "Shade" personal accent color. Updates locally right away for
  // instant feedback, then persists and refreshes the circle roster so
  // your avatar chip picks up the new color for anyone viewing it.
  async function updateColor(color) {
    setUser((u) => (u ? { ...u, color } : u));
    const { user: updated } = await api.put('/auth/color', { color });
    setUser(updated);
    await loadCircle();
  }

  // Updates name and/or email. Optimistic on name (instant feedback in the
  // topbar/avatar), but email is left to the server response since a
  // change there can be rejected (already in use).
  async function updateProfile(fields) {
    const { user: updated } = await api.put('/auth/profile', fields);
    setUser(updated);
    return updated;
  }

  // Changing the password doesn't touch `user` state or require a
  // re-login — the current token stays valid.
  async function changePassword(currentPassword, newPassword) {
    await api.put('/auth/password', { currentPassword, newPassword });
  }

  // Sets what one specific circle member can see of your book. No local
  // optimistic state to update here (sharing now lives per-person in
  // `circle.sharing`, not on the account) — just persist and reload.
  async function updateSharedModulesFor(userId, sharedModules) {
    await api.put(`/auth/circle/${userId}/shared-modules`, { sharedModules });
    await loadCircle();
  }

  // 30-minute inactivity window -> automatic logout, per the brief.
  useIdleTimer(
    () => user && logout(),
    () => user && refreshToken()
  );

  // There's no push from the server when someone changes what they share
  // with you — poll periodically so the nav (which reads circle.viewable)
  // catches a revoked module without needing a full page reload.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(loadCircle, 45000);
    return () => clearInterval(id);
  }, [user, loadCircle]);

  const value = {
    user,
    booting,
    login,
    register,
    logout,
    updateColor,
    updateProfile,
    changePassword,
    updateSharedModulesFor,
    circle,
    loadCircle,
    viewingId,
    setViewingId,
    // The book currently on screen: undefined/null id means "my own book".
    viewingSelf: !viewingId || viewingId === user?.id,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}