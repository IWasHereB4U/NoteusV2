import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePolling } from './usePolling.js';

// Loads a list from `path`, automatically re-fetching whenever the
// person-switcher changes whose book we're looking at.
export function useResource(path) {
  const { viewingId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(path, viewingId || undefined);
      setItems(data);
      setError(null);
    } catch (err) {
      // A revoked module (or any other failure) must clear stale data —
      // otherwise whatever was last successfully fetched just sits in
      // state forever, even after access is pulled, since nothing else
      // ever touches `items` on a failed reload.
      setItems([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path, viewingId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Circle sharing can change while this page is already open (someone
  // else revokes a module mid-session) — there's no push from the server,
  // so poll periodically to catch a now-403'd module instead of leaving
  // whatever was last fetched on screen indefinitely.
  //
  // Visible-tab only, and every 2 minutes rather than 45s: a revoked
  // share showing up a minute later is fine, and this runs once per open
  // page per tab.
  usePolling(reload, 120000);

  return { items, loading, error, reload, viewingId };
}