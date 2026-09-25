import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Animation catalog. `duo: true` means it needs two chibis to play — the
// server pairs up two waiting requesters before either side is told to
// start, rather than letting one client just play it alone.
export const ANIMATIONS = {
  wave: { duo: false, label: 'Wave' },
  dance: { duo: false, label: 'Dance' },
  sit: { duo: false, label: 'Sit' },
  handshake: { duo: true, label: 'Handshake' },
  highfive: { duo: true, label: 'High five' },
};

const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

// userId -> { socketId, name, color, x, peerIds:Set }
const online = new Map();
// animation type -> Map<userId, { x, requestedAt }>
const duoWaiting = new Map();

export function attachYard(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin || '*' } });

  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (!user) return next(new Error('unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const userId = String(user._id);
    const peerIds = new Set(
      user.circle.filter((c) => c.status === 'accepted').map((c) => String(c.user))
    );

    socket.join(`user:${userId}`);
    peerIds.forEach((peerId) => socket.join(`pair:${pairKey(userId, peerId)}`));

    const startX = 40 + Math.round(Math.random() * 200);
    online.set(userId, { socketId: socket.id, name: user.name, color: user.color, x: startX, peerIds });

    // Tell the newcomer who from their circle is already in the yard.
    const roster = [...peerIds]
      .filter((id) => online.has(id))
      .map((id) => ({ userId: id, ...pick(online.get(id), ['name', 'color', 'x']) }));
    socket.emit('yard:roster', roster);

    // Tell those peers this chibi just walked in.
    peerIds.forEach((peerId) => {
      io.to(`pair:${pairKey(userId, peerId)}`).emit('yard:join', {
        userId,
        name: user.name,
        color: user.color,
        x: startX,
      });
    });

    socket.on('chibi:move', ({ x }) => {
      const entry = online.get(userId);
      if (!entry || typeof x !== 'number') return;
      entry.x = x;
      peerIds.forEach((peerId) => {
        socket.to(`pair:${pairKey(userId, peerId)}`).emit('yard:move', { userId, x });
      });
    });

    socket.on('chibi:animate', ({ type }) => {
      const def = ANIMATIONS[type];
      if (!def) return;

      if (!def.duo) {
        peerIds.forEach((peerId) => {
          io.to(`pair:${pairKey(userId, peerId)}`).emit('yard:animate', {
            userId,
            type,
            startAt: Date.now() + 200,
          });
        });
        return;
      }

      // Duo animation: look for someone already waiting who is also in
      // this user's circle. First match wins; no queueing beyond that.
      const pool = duoWaiting.get(type) || new Map();
      duoWaiting.set(type, pool);

      let partnerId = null;
      for (const candidateId of pool.keys()) {
        if (candidateId !== userId && peerIds.has(candidateId)) {
          partnerId = candidateId;
          break;
        }
      }

      if (partnerId) {
        pool.delete(partnerId);
        const me = online.get(userId);
        const other = online.get(partnerId);
        const meetX = Math.round(((me?.x ?? 0) + (other?.x ?? 0)) / 2);
        const startAt = Date.now() + 1400; // time for both chibis to walk to the meet point
        io.to(`user:${userId}`).emit('yard:duo-matched', { type, partnerId, meetX, startAt });
        io.to(`user:${partnerId}`).emit('yard:duo-matched', { type, partnerId: userId, meetX, startAt });
      } else {
        const requestedAt = Date.now();
        pool.set(userId, { x: online.get(userId)?.x ?? 0, requestedAt });
        socket.emit('yard:duo-waiting', { type });
        setTimeout(() => {
          if (pool.get(userId)?.requestedAt === requestedAt) {
            pool.delete(userId);
            socket.emit('yard:duo-timeout', { type });
          }
        }, 15000);
      }
    });

    socket.on('disconnect', () => {
      online.delete(userId);
      duoWaiting.forEach((pool) => pool.delete(userId));
      peerIds.forEach((peerId) => {
        io.to(`pair:${pairKey(userId, peerId)}`).emit('yard:leave', { userId });
      });
    });
  });

  return io;
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => (out[k] = obj[k]));
  return out;
}
