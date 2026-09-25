// Resolves CLIENT_ORIGIN into whatever shape the `cors` package (Express)
// and Socket.IO's own `cors.origin` option both accept — a boolean,
// a string, or an array of strings all work for either.
//
// Why this needs to be flexible at all: when the client is opened from
// another device on the same network (a phone over ZeroTier/LAN, say,
// hitting the PC's ZeroTier/LAN IP instead of localhost), its requests
// carry an Origin header that doesn't match a single hardcoded
// "http://localhost:5173". A plain single-origin CORS check would reject
// that device even though it's legitimately allowed onto the network.
//
//   - Unset / empty            -> true   (reflect whatever Origin sent the
//                                         request — fine for local/dev use
//                                         since this server isn't meant to
//                                         be reachable from the public
//                                         internet in that mode)
//   - "*"                      -> "*"    (explicit wildcard)
//   - "http://a.com,http://b"  -> ["http://a.com", "http://b"] (allowlist —
//                                         use this in production, listing
//                                         every real origin that should be
//                                         allowed)
export function resolveCorsOrigin(raw = process.env.CLIENT_ORIGIN) {
  const value = (raw ?? '').trim();
  if (!value) return true;
  if (value === '*') return '*';
  const origins = value.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length > 1 ? origins : origins[0];
}
