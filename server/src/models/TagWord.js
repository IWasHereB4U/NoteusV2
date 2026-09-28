import mongoose from 'mongoose';

// One word in the Note Tag module, carrying any number of tags.
const tagWordSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    word: { type: String, required: true, trim: true },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'NoteTag' }],
  },
  { timestamps: true }
);

export default mongoose.model('TagWord', tagWordSchema);
