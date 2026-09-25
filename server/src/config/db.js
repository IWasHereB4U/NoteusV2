import mongoose from 'mongoose';

let dbPromise = null;

// Cached at module scope so a warm Vercel function invocation reuses the
// existing connection instead of reconnecting on every request; a failed
// attempt clears the cache so the next request retries instead of
// replaying the same rejection forever.
export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!dbPromise) {
    const uri = process.env.MONGO_URI;
    if (!uri) return Promise.reject(new Error('MONGO_URI is not set'));
    mongoose.set('strictQuery', true);
    dbPromise = mongoose
      .connect(uri)
      .then(() => console.log('[db] connected to', uri.replace(/\/\/.*@/, '//<hidden>@')))
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
