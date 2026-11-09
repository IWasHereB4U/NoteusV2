import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite } from '../middleware/auth.js';
import Workout from '../models/Workout.js';
import WorkoutSet from '../models/WorkoutSet.js';

// Deleting a workout also drops it from every set that listed it, so a set
// never points at a workout that no longer exists. Mounted ahead of the
// generic resource router for /api/workouts, which handles the rest.
const router = Router();

router.delete('/:id', requireAuth, resolveViewer, requireOwnWrite, async (req, res) => {
  const workout = await Workout.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!workout) return res.status(404).json({ error: 'Not found' });
  await WorkoutSet.updateMany(
    { owner: req.ownerId, 'items.workoutId': workout._id },
    { $pull: { items: { workoutId: workout._id } } }
  );
  res.json({ ok: true });
});

export default router;
