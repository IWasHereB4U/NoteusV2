import { useEffect, useRef } from 'react';

// setInterval that only runs while the tab is actually visible.
//
// Every poll is one Vercel function invocation (plus the memory/CPU time
// it takes). A plain setInterval keeps firing in background tabs, on a
// laptop left open overnight, etc. — which is where most of the usage
// was coming from. This pauses while the tab is hidden and does one
// catch-up call when the person comes back (if at least one interval
// has passed), so the data is still fresh when they look at it.
export function usePolling(fn, intervalMs, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || !intervalMs) return;
    let timer = null;
    let lastRun = Date.now();

    const tick = () => {
      lastRun = Date.now();
      fnRef.current();
    };
    const start = () => {
      if (!timer) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRun >= intervalMs) tick();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
