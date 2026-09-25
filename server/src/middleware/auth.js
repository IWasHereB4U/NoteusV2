import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verifies the JWT and attaches req.user (the logged-in account).
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session no longer valid' });

    req.user = user;
    next();
  } catch (err) {
    // Covers expiry too -- a stale token from a 30-min-idle session lands here.
    return res.status(401).json({ error: 'Session expired' });
  }
}

// Resolves which user's book is being requested. A request can pass
// ?viewAs=<userId> to look at someone else's book; this is only allowed
// when that user is in req.user's accepted circle (or is req.user).
export async function resolveViewer(req, res, next) {
  const viewAs = req.query.viewAs || req.body.viewAs;
  if (!viewAs || viewAs === String(req.user._id)) {
    req.ownerId = req.user._id;
    return next();
  }

  const allowed = req.user.circle.some(
    (c) => c.status === 'accepted' && String(c.user) === String(viewAs)
  );
  if (!allowed) return res.status(403).json({ error: 'Not in your circle' });

  req.ownerId = viewAs;
  next();
}

// Viewing someone else's book (via the circle) is read-only. Only the
// account that owns a book can add/edit/delete entries in it.
export function requireOwnWrite(req, res, next) {
  if (String(req.ownerId) !== String(req.user._id)) {
    return res.status(403).json({ error: "You can view this book but can't edit it" });
  }
  next();
}

// Gates a module behind the *owner's* per-person sharing preferences for
// this viewer specifically. Viewing your own book always passes. Viewing
// someone else's checks the owner's circle entry for req.user — being in
// their accepted circle gets you into their book at all, but each member
// can be granted a different set of modules, not automatically every one.
export function requireModuleShared(moduleKey) {
  return async (req, res, next) => {
    if (!moduleKey || String(req.ownerId) === String(req.user._id)) return next();
    const owner = await User.findById(req.ownerId).select('circle');
    const entry = owner?.circle.find(
      (c) => c.status === 'accepted' && String(c.user) === String(req.user._id)
    );
    if (!entry) return res.status(403).json({ error: 'Not in this person\'s circle' });
    if (!entry.sharedModules.includes(moduleKey)) {
      return res.status(403).json({ error: "This person hasn't shared this module with you" });
    }
    next();
  };
}