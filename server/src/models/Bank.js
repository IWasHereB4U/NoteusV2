import mongoose from 'mongoose';

// One document per bank card on the Bankbook page. The amounts live in
// BankHistory, keyed back to this bank by `bankId`.
const bankSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('Bank', bankSchema);
