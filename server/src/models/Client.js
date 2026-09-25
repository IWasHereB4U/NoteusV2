import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    company: String,
    email: String,
    phone: String,
    rate: Number,
    notes: String,
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
