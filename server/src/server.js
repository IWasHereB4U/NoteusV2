import dns from 'node:dns';
import os from 'node:os';
import 'dotenv/config';

dns.setServers(['1.1.1.1', '1.0.0.1']);

import { createServer } from 'node:http';
import { connectDB } from './config/db.js';
import { attachYard } from './realtime/yard.js';
import { resolveCorsOrigin } from './config/corsOrigin.js';
import app from './app.js';

const PORT = process.env.PORT || 4000;

// Node's http server already binds to all interfaces by default (no host
// passed to .listen()), so it's reachable from another device on the same
// network — LAN, or a ZeroTier/Tailscale-style virtual network — as long
// as CORS allows that device's origin (see corsOrigin.js) and nothing else
// (a firewall, router isolation) is blocking the port. This just prints
// every non-internal address the server is listening on so it's obvious
// what URL a phone/other device should use — no need to hunt for it with
// `ipconfig`/`ifconfig` or the ZeroTier app separately.
function listNetworkAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

connectDB()
  .then(() => {
    const httpServer = createServer(app);
    attachYard(httpServer, resolveCorsOrigin());
    httpServer.listen(PORT, () => {
      console.log(`[server] listening on :${PORT} (http + socket.io)`);
      console.log(`[server]   local:   http://localhost:${PORT}`);
      listNetworkAddresses().forEach((addr) => {
        console.log(`[server]   network: http://${addr}:${PORT}  (use this from another device, e.g. over ZeroTier)`);
      });
    });
  })
  .catch((err) => {
    console.error('[db] failed to connect', err);
    process.exit(1);
  });
