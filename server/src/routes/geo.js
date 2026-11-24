import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

// Short map links (maps.app.goo.gl/..., goo.gl/maps/...) hide their
// coordinates behind a redirect, and the browser can't follow it (CORS).
// This follows the redirect chain for the client and returns the final URL,
// which the client then reads coordinates from.
//
// It is an open "fetch this URL" endpoint, so it only ever requests Google's
// own link/map hosts — never an arbitrary address a user typed.
const ALLOWED_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|share\.google|(www\.|maps\.)?google\.[a-z.]{2,10})$/i;
const MAX_HOPS = 6;

function allowed(u) {
  return u.protocol === 'https:' && ALLOWED_HOST.test(u.hostname);
}

const router = Router();

router.get('/resolve', requireAuth, async (req, res) => {
  let current;
  try {
    current = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'That is not a valid link' });
  }
  if (!allowed(current)) return res.status(400).json({ error: 'Only Google Maps links can be expanded' });

  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const r = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(7000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoteusLinkResolver/1.0)', Accept: 'text/html' },
      });
      await r.body?.cancel().catch(() => {});
      const loc = r.headers.get('location');
      if (r.status < 300 || r.status >= 400 || !loc) break;
      const next = new URL(loc, current);
      current = next;
      if (!allowed(next)) break; // report it, but never request it
    }
    res.json({ url: current.toString() });
  } catch {
    res.status(502).json({ error: "Couldn't open that link — paste the full link or the coordinates instead" });
  }
});

export default router;
