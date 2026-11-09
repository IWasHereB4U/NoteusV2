import mongoose from 'mongoose';

// One row in the Calorie log — the equivalent of a Transaction on the Money
// page. `intake` is calories eaten (like income), `burn` is calories spent
// (like an expense). Rows added from the Foods / Workouts / Sets libraries
// are a *snapshot*: the calories and name are copied in at the time, so
// editing or deleting the library item later never rewrites past days.
export const CALORIE_SOURCES = ['manual', 'food', 'workout', 'set'];

const calorieEntrySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    type: { type: String, enum: ['intake', 'burn'], required: true },
    name: { type: String, default: '' },
    calories: { type: Number, required: true, min: 0 },
    note: String,
    source: { type: String, enum: CALORIE_SOURCES, default: 'manual' },
  },
  { timestamps: true }
);

export default mongoose.model('CalorieEntry', calorieEntrySchema);
