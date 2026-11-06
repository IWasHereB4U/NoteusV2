import mongoose from 'mongoose';

// One recorded amount for one bank on one date — the rows listed in a
// bank card's history modal.
const bankHistorySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('BankHistory', bankHistorySchema);
