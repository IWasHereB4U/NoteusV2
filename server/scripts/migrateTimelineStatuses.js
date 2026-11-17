// One-off: renames the old Project Timeline statuses saved in MongoDB
//   'Coding Fix' -> 'Development'      'UT' -> 'Unit Testing'
// and puts every project's phases into pipeline order.
//
// Run once from /server:   node scripts/migrateTimelineStatuses.js
// Safe to run twice. (The app also maps old names on the fly, so nothing breaks
// if you skip this — but the database stays tidier if you run it.)
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { PHASE_STATUSES, LEGACY_STATUS } from '../src/models/ProjectTimeline.js';

await connectDB();
const col = mongoose.connection.collection('projecttimelines');

let renamed = 0;
for (const [from, to] of Object.entries(LEGACY_STATUS)) {
  const r = await col.updateMany(
    { 'phases.status': from },
    { $set: { 'phases.$[p].status': to } },
    { arrayFilters: [{ 'p.status': from }] }
  );
  renamed += r.modifiedCount;
  console.log(`"${from}" -> "${to}": ${r.modifiedCount} project(s)`);
}

let sorted = 0;
for await (const doc of col.find({ 'phases.1': { $exists: true } })) {
  const ordered = [...doc.phases].sort((a, b) => PHASE_STATUSES.indexOf(a.status) - PHASE_STATUSES.indexOf(b.status));
  if (ordered.some((p, i) => p !== doc.phases[i] && p.status !== doc.phases[i].status)) {
    await col.updateOne({ _id: doc._id }, { $set: { phases: ordered } });
    sorted += 1;
  }
}
console.log(`Reordered phases on ${sorted} project(s). Done (${renamed} rename update(s)).`);
await mongoose.disconnect();
