import mongoose from 'mongoose';

// A label that words in the Note Tag module can carry.
const noteTagSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: '#0E9C92' },
  },
  { timestamps: true }
);

export default mongoose.model('NoteTag', noteTagSchema);
