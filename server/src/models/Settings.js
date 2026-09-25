import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currency: { type: String, default: '₱' },
    biz: {
      name: String,
      email: String,
      phone: String,
      tin: String,
      address: String,
      payTo: String,
      prefix: { type: String, default: 'INV-' },
      next: { type: Number, default: 1 },
      terms: { type: Number, default: 15 },
      footer: String,
    },
    tax: {
      mixed: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Settings', settingsSchema);
