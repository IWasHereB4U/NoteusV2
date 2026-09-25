import 'dotenv/config';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// Vercel's Node.js runtime just needs a plain (req, res) handler — an
// Express app instance already is one. Connecting here (rather than in
// app.js) keeps app.js reusable by src/server.js too, which connects
// before it starts listening instead of per-request.
export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('[db] failed to connect', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database connection failed' }));
    return;
  }
  return app(req, res);
}
