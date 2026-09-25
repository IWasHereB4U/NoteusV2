import mongoose from 'mongoose';

const filingSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    form: { type: String, required: true },
    label: String,
    due: { type: String, required: true },
    status: { type: String, enum: ['ready', 'filed'], default: 'ready' },
    filedOn: String,
    ref: String,
    amountPaid: Number,
    frozen: mongoose.Schema.Types.Mixed, // worksheet snapshot at time of filing
  },
  { timestamps: true }
);

export default mongoose.model('Filing', filingSchema);
