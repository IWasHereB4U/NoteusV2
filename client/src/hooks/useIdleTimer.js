import { useEffect, useRef } from 'react';

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_THROTTLE_MS = 60 * 1000; // don't hit /refresh more than once a minute

// Watches for real user activity. If none arrives for 30 minutes, calls
// onIdle() (the app logs the person out). While active, calls onActivity()
// at most once a minute so the caller can silently refresh the JWT and
// keep the session alive through a normal working session.
export function useIdleTimer(onIdle, onActivity) {
  const idleTimeout = useRef(null);
  const lastPing = useRef(0);

  useEffect(() => {
    function resetIdleTimer() {
      clearTimeout(idleTimeout.current);
      idleTimeout.current = setTimeout(onIdle, IDLE_LIMIT_MS);

      const now = Date.now();
      if (now - lastPing.current > REFRESH_THROTTLE_MS) {
        lastPing.current = now;
        onActivity?.();
      }
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();

    return () => {
      clearTimeout(idleTimeout.current);
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
    };
  }, [onIdle, onActivity]);
}
