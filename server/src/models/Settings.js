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
      // MGOctaviano07Oct2026: invoice-only fields (payTo, prefix, next, terms, footer) removed.
    },
    tax: {
      mixed: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Settings', settingsSchema);
