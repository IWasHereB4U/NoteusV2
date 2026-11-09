import mongoose from 'mongoose';

export const WORKOUT_MEASURES = ['repetition', 'duration'];

// Saved workout. `calories` is what the workout burns for ONE round of the
// stated `amount` — e.g. "Push-ups, 20 repetitions, 8 kcal" or "Jogging,
// 30 minutes, 280 kcal". `amount` is a rep count when `measure` is
// 'repetition' and minutes when it's 'duration'.
const workoutSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    calories: { type: Number, required: true, min: 0 }, // calories burned
    measure: { type: String, enum: WORKOUT_MEASURES, default: 'repetition' },
    amount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Workout', workoutSchema);
