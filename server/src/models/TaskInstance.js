import mongoose from 'mongoose';

// A reusable task blueprint. "Using" one on the Tasks page copies its
// name/link/note/checklist into a brand-new Task — nothing links back, so
// the copy and the instance can be edited independently afterwards.
const taskInstanceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    link: { type: String, default: '' },
    note: { type: String, default: '' },
    // Nested checklist: [{ id, text, done, children: [...] }]
    checklist: { type: Array, default: [] },
    // Form Macros browser-extension macros: [{ id, name, match, steps }].
    // Built in the extension; kept here so each task carries its own.
    macros: { type: Array, default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('TaskInstance', taskInstanceSchema);
