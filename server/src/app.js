import express from 'express';
// Express 4 doesn't catch rejected promises from async handlers — a thrown
// error (bad ObjectId, validation failure, DB hiccup) left the request
// hanging with no response. On Vercel a hanging request keeps the 2 GB
// instance billed for Provisioned Memory until the function times out.
// This patch routes those rejections to the error handler at the bottom.
import 'express-async-errors';
import cors from 'cors';

import { resolveCorsOrigin } from './config/corsOrigin.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import { resourceRouter } from './routes/resource.js';
import noteFolderRoutes from './routes/noteFolders.js';
import noteCardRoutes from './routes/noteCards.js';
import recurringRuleRoutes from './routes/recurringRules.js';
import mediaRoutes, { UPLOAD_DIR } from './routes/media.js';

import Client from './models/Client.js';
import Transaction from './models/Transaction.js';
import Task from './models/Task.js';
import Meeting from './models/Meeting.js';
import Filing from './models/Filing.js';
import Invoice from './models/Invoice.js';
import CalendarEvent from './models/CalendarEvent.js';
import TimesheetDay from './models/TimesheetDay.js';

// Just the Express app — no .listen(), no DB connect, no Socket.io
// attached. Two entry points share this:
//   - src/server.js  — local dev, Render/Railway/a VPS: a normal
//     long-running process that also wires up the chibi Socket.io layer.
//   - api/index.js   — Vercel's serverless Node runtime, which just needs
//     a plain (req, res) handler and can't host a persistent Socket.io
//     server or persist file uploads across invocations.
const app = express();
// maxAge lets the browser cache the CORS preflight for 24h. Every JSON
// request with an Authorization header triggers an OPTIONS preflight when
// the client and API are on different origins — without this, that's a
// second function invocation for nearly every real request.
app.use(cors({ origin: resolveCorsOrigin(), maxAge: 86400 }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/clients', resourceRouter(Client, { moduleKey: 'clients' }));
app.use('/api/transactions', resourceRouter(Transaction, { sortBy: '-date', moduleKey: 'money' }));
app.use('/api/tasks', resourceRouter(Task, { sortBy: 'due', moduleKey: 'tasks' }));
app.use('/api/meetings', resourceRouter(Meeting, { sortBy: 'date', moduleKey: 'meetings' }));
app.use('/api/filings', resourceRouter(Filing, { sortBy: 'due', moduleKey: 'filing' }));
app.use('/api/invoices', resourceRouter(Invoice, { sortBy: '-issueDate', moduleKey: 'invoices' }));
app.use('/api/calendar-events', resourceRouter(CalendarEvent, { sortBy: 'date', moduleKey: 'calendar' }));
app.use('/api/timesheet-days', resourceRouter(TimesheetDay, { sortBy: '-date', moduleKey: 'timesheet' }));
app.use('/api/note-folders', noteFolderRoutes);
app.use('/api/note-cards', noteCardRoutes);
app.use('/api/recurring-rules', recurringRuleRoutes);
app.use('/api/media', mediaRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

export default app;