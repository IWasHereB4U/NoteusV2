import mongoose from 'mongoose';

// A named list of workouts (a routine). The total calories burned is not
// stored — it's always derived from the workouts' current numbers, so
// editing a workout updates every set that uses it. Called WorkoutSet, not
// Set, to stay clear of JavaScript's built-in Set.
const workoutSetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    items: [
      {
        _id: false,
        workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', required: true },
        times: { type: Number, default: 1, min: 1 }, // rounds of that workout in the set
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('WorkoutSet', workoutSetSchema);
