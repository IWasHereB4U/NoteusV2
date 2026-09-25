import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const noteFolderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteFolder', default: null, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, default: null }, // null = no password set
    // Circle members granted edit access to every card in this folder
    // (create/update/delete), not just view access. Owner-only to set —
    // see routes/noteFolders.js. Independent of NoteCard.editors, which
    // grants the narrower "just this one card" version of the same thing.
    editors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

noteFolderSchema.methods.checkPassword = function (plain) {
  if (!this.passwordHash) return true;
  return bcrypt.compare(plain || '', this.passwordHash);
};

noteFolderSchema.set('toJSON', {
  transform(doc, ret) {
    ret.locked = !!ret.passwordHash;
    delete ret.passwordHash; // never leak the hash to the client
    return ret;
  },
});

export default mongoose.model('NoteFolder', noteFolderSchema);
