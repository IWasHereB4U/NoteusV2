import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Local dev talks straight to the local Express server (server/src/server.js),
  // which reads/writes the database directly — no Vercel involved. That
  // matches client/.env.example's own promise ("leave VITE_API_URL unset
  // for local dev"). Pointing this at the deployed Vercel backend instead
  // means every local request — including login — goes out over the
  // network and is subject to that deployment's own billing/usage limits
  // (a paused/over-limit Vercel project answers everything with 402
  // Payment Required, even though nothing is actually wrong locally).
  // Set VITE_API_PROXY_TARGET in client/.env if you deliberately want to
  // develop against a remote backend (e.g. shared staging data).
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // 0.0.0.0 instead of the default 127.0.0.1-only bind — this is what
      // lets another device on the same network (a phone on the same
      // ZeroTier network, or plain LAN/Wi-Fi) open the dev server at all.
      // `npm run dev` will print both the Local and Network URLs; use the
      // Network one (your PC's ZeroTier/LAN IP) on the other device.
      host: true,
      // Vite checks the request's Host header against an allowlist by
      // default (DNS-rebinding protection) and would otherwise reject a
      // request whose Host is a ZeroTier/LAN IP or hostname. This is a
      // local dev server never meant to be exposed to the public internet,
      // so it's safe to disable that check entirely rather than having to
      // list every device's IP by hand.
      allowedHosts: true,
      proxy: {
        '/api': apiTarget,
        '/socket.io': { target: apiTarget, ws: true },
        '/uploads': apiTarget,
      },
    },
  };
});
