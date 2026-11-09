import mongoose from 'mongoose';

export const WORKOUT_MEASURES = ['repetition', 'duration'];

// Muscle groups a workout can be good for. Kept in sync with BODY_PARTS in
// client/src/pages/Calorie.jsx (same duplicate-the-list convention as MODULE_KEYS).
export const BODY_PARTS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'full body'];

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
    // Which body parts it's good for — any number, used to filter/search.
    bodyParts: { type: [{ type: String, enum: BODY_PARTS }], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Workout', workoutSchema);
