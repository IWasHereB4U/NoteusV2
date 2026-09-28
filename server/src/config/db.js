import mongoose from 'mongoose';

let dbPromise = null;

// Cached at module scope so a warm Vercel function invocation reuses the
// existing connection instead of reconnecting on every request; a failed
// attempt clears the cache so the next request retries instead of
// replaying the same rejection forever.
//
// The options below keep a serverless instance from sitting around
// (and being billed for Provisioned Memory) while the DB is unreachable:
//   - bufferCommands: false  — fail queries right away instead of
//                              queueing them for up to 10s
//   - serverSelectionTimeoutMS — give up connecting after 5s, not 30s
//   - maxPoolSize: 5         — one instance handles a handful of
//                              concurrent requests; no need for 100 sockets
export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!dbPromise) {
    const uri = process.env.MONGO_URI;
    if (!uri) return Promise.reject(new Error('MONGO_URI is not set'));
    mongoose.set('strictQuery', true);
    mongoose.set('bufferCommands', false);
    dbPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 5,
      })
      .then(() => console.log('[db] connected to', uri.replace(/\/\/.*@/, '//<hidden>@')))
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
