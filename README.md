# NOTEUS — Because its for U and Me, Noting Everything

A MERN (MongoDB, Express, React, Node) rewrite of the original single-file
NoteUs ledger, redesigned as a shared/family book: several people can each
keep their own ledger, and view (read-only) any book they've been invited
into via their **circle**.

This is **Phase 1** of the larger project: the core ledger, new visual
identity, auth with 30-minute idle auto-logout, and personnel management.
Phase 2 (interactive chibi companions) and Phase 3 (the Notes module) build
on top of this foundation and aren't included yet.

## What's here

```
server/   Express + MongoDB API
client/   React (Vite) frontend
```

### Backend (`server/`)
- JWT auth (`/api/auth/register`, `/login`, `/refresh`, `/me`)
- Circle / personnel management (`/api/auth/circle*`) — invite by email,
  accept/decline, remove. Circle membership is what lets the person-switcher
  show someone else's book.
- Resource APIs, all scoped to whichever book is being viewed and
  permission-checked against the circle: `/api/clients`, `/api/transactions`,
  `/api/tasks`, `/api/meetings`, `/api/filings`, `/api/invoices`,
  `/api/settings`
- Viewing someone else's book (`?viewAs=<userId>`) is always read-only —
  only the book's owner can write to it.

### Frontend (`client/`)
- New visual identity: near-black teal ink, cool paper background, Fraunces
  display type + Inter body + JetBrains Mono for data. Nothing carried over
  from the original's cream/receipt-tape look.
- A **roster strip** in the topbar is the person-switcher for shared/family
  viewing — click an avatar to switch whose book you're looking at. This
  strip is deliberately where Phase 2's chibi companions will live.
- Pages: Dashboard, Clients, Money, Invoices, Tasks, Meetings, Filing desk,
  Settings, Circle (personnel management).
- 30-minute inactivity → automatic logout (`src/hooks/useIdleTimer.js`).
  Real activity silently refreshes the JWT so an active session never gets
  interrupted mid-work.

## Running it locally

You'll need Node 18+ and a MongoDB instance (local `mongod`, or a free
MongoDB Atlas cluster — this sandbox couldn't reach Atlas itself, so this
hasn't been run against a live database; the server code has only been
syntax-checked, and the client has been build-checked with `vite build`).

### 1. Backend

```bash
cd server
cp .env.example .env
# edit .env: set MONGO_URI to your database, and JWT_SECRET to something random
npm install
npm run dev
```

Runs on `http://localhost:4000`.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api` to the backend (see
`vite.config.js`).

### 3. Try it

1. Open `http://localhost:5173`, register an account.
2. Register a second account (a different browser profile or incognito
   window works well for this).
3. From **Circle**, invite the second account's email; log in as that
   account and accept.
4. Switch between the two in the roster strip at the top — the second
   book opens read-only.

## Known simplifications vs. the original

- The Filing desk no longer auto-generates BIR form packs or computes
  Philippine tax figures from your transactions — you add a filing pack
  manually (form, label, due date) and mark it filed. The original's
  `packFigures`/tax-formula logic wasn't ported; it's a reasonable next
  addition once the core is confirmed working for you.
- Invoice line items are entered as `description, qty, rate` per line
  rather than a dedicated line-item editor with add/remove rows.
- No PDF/print export for invoices or filing worksheets yet.
- No data import from the original app's browser `localStorage` — this is
  a fresh database.

## Roadmap (not yet built)

- **Phase 2 — Chibi companions**: draggable/walking sprite characters,
  right-click radial "wheel" menu of animations, and real-time (Socket.io)
  sync so two chibis belonging to different logged-in circle members can
  wait for and match a two-person animation like a handshake.
- **Phase 3 — Notes module**: nested folders (optionally password-protected
  per folder), cards in "free" (Canva-style absolute-position canvas) or
  "fixed" (linear document) mode, full rich text editing (headings, tables,
  embeds), and a shared media upload/download module usable from either
  card type.
