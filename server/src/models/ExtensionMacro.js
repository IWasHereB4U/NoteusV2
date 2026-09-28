import mongoose from 'mongoose';

// A Form Macros browser-extension macro stored in NoteUs, so it can be kept,
// shared through the circle, downloaded as a file, or pushed straight into
// the extension. `steps` mirrors the extension's own format:
// [{ type, selector, value }] — the client sanitizes before saving.
const extensionMacroSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    match: { type: String, default: '*' },
    steps: { type: Array, default: [] },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('ExtensionMacro', extensionMacroSchema);
