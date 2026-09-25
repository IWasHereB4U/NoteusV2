import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { API_ORIGIN } from '../api/client.js';

const YardContext = createContext(null);

export const ANIMATIONS = {
  wave: { duo: false, label: 'Wave', icon: '👋' },
  dance: { duo: false, label: 'Dance', icon: '💃' },
  sit: { duo: false, label: 'Sit', icon: '🪑' },
  handshake: { duo: true, label: 'Handshake', icon: '🤝' },
  highfive: { duo: true, label: 'High five', icon: '🙌' },
};

export function YardProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  // chibis: { [userId]: { userId, name, color, x, self, animation, duoPartnerId, duoMeetX } }
  const [chibis, setChibis] = useState({});
  const [waiting, setWaiting] = useState(null); // animation type currently queued for a partner

  const patch = useCallback((userId, fields) => {
    setChibis((cs) => ({ ...cs, [userId]: { ...cs[userId], ...fields } }));
  }, []);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setChibis({});
      return;
    }

    const token = localStorage.getItem('noteus_token');
    const socket = io(API_ORIGIN || '/', { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const selfX = 40 + Math.round(Math.random() * 200);
    setChibis({ [user.id]: { userId: user.id, name: user.name, color: user.color, x: selfX, self: true } });

    socket.on('yard:roster', (roster) => {
      setChibis((cs) => {
        const next = { ...cs };
        roster.forEach((c) => (next[c.userId] = { ...c, self: false }));
        return next;
      });
    });
    socket.on('yard:join', (c) => patch(c.userId, { ...c, self: false }));
    socket.on('yard:leave', ({ userId }) => {
      setChibis((cs) => {
        const next = { ...cs };
        delete next[userId];
        return next;
      });
    });
    socket.on('yard:move', ({ userId, x }) => patch(userId, { x }));
    socket.on('yard:animate', ({ userId, type, startAt }) => {
      const delay = Math.max(0, startAt - Date.now());
      setTimeout(() => patch(userId, { animation: type, animKey: Date.now() }), delay);
    });
    socket.on('yard:duo-waiting', ({ type }) => setWaiting(type));
    socket.on('yard:duo-timeout', () => setWaiting(null));
    socket.on('yard:duo-matched', ({ type, partnerId, meetX, startAt }) => {
      setWaiting(null);
      patch(user.id, { x: meetX, duoPartnerId: partnerId });
      patch(partnerId, { x: meetX, duoPartnerId: user.id });
      socket.emit('chibi:move', { x: meetX });
      const delay = Math.max(0, startAt - Date.now());
      setTimeout(() => {
        patch(user.id, { animation: type, animKey: Date.now(), duoPartnerId: null });
        patch(partnerId, { animation: type, animKey: Date.now(), duoPartnerId: null });
      }, delay);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function moveSelf(x) {
    if (!user) return;
    patch(user.id, { x });
    socketRef.current?.emit('chibi:move', { x });
  }

  function playAnimation(type) {
    socketRef.current?.emit('chibi:animate', { type });
    if (!ANIMATIONS[type]?.duo) {
      patch(user.id, { animation: type, animKey: Date.now() });
    }
  }

  return (
    <YardContext.Provider value={{ chibis, moveSelf, playAnimation, waiting, selfId: user?.id }}>
      {children}
    </YardContext.Provider>
  );
}

export function useYard() {
  const ctx = useContext(YardContext);
  if (!ctx) throw new Error('useYard must be used within YardProvider');
  return ctx;
}
