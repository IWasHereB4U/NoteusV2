import { useCallback, useState } from 'react';

// A Set of "collapsed" ids that is remembered in localStorage, so a long
// task list stays folded the way you left it after a reload or refresh.
// Pass a null/undefined storageKey for a purely in-memory set.
export function useCollapsed(storageKey) {
  const [set, setSet] = useState(() => {
    if (!storageKey) return new Set();
    try {
      const raw = localStorage.getItem(storageKey);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const update = useCallback(
    (fn) => {
      setSet((prev) => {
        const next = fn(new Set(prev));
        if (storageKey) {
          try {
            if (next.size) localStorage.setItem(storageKey, JSON.stringify([...next]));
            else localStorage.removeItem(storageKey);
          } catch {
            /* storage full or blocked — folding still works for this session */
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const toggle = useCallback(
    (id) => update((s) => { s.has(id) ? s.delete(id) : s.add(id); return s; }),
    [update]
  );
  const setAll = useCallback((ids) => update(() => new Set(ids)), [update]);
  const remove = useCallback(
    (ids) => update((s) => { ids.forEach((i) => s.delete(i)); return s; }),
    [update]
  );

  return { collapsed: set, toggle, setAll, remove };
}
