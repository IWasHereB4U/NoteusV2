import mongoose from 'mongoose';

// Checklist items nest: each item can have its own `children` list, as
// deep as needed. Stored as plain objects ({ id, text, done, children })
// rather than a recursive sub-schema — the client owns the tree shape and
// always sends the whole list back on save.
const taskSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    due: String,
    done: { type: Boolean, default: false },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    link: { type: String, default: '' },
    note: { type: String, default: '' },
    checklist: { type: Array, default: [] },
    // The Task Instance this task was created from, if any. Informational
    // only — the task is a full independent copy, so editing either one
    // never touches the other.
    fromInstance: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskInstance', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
