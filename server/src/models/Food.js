import mongoose from 'mongoose';

// Saved food: a name and its calories, for one-tap logging on the Calorie page.
const foodSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    calories: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Food', foodSchema);
