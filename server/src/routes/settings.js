import { Router } from 'express';
import { requireAuth, resolveViewer } from '../middleware/auth.js';
import Settings from '../models/Settings.js';

const router = Router();

router.get('/', requireAuth, resolveViewer, async (req, res) => {
  let settings = await Settings.findOne({ owner: req.ownerId });
  if (!settings) settings = await Settings.create({ owner: req.ownerId });
  res.json(settings);
});

router.put('/', requireAuth, async (req, res) => {
  // Settings are always about your own book, never the person you're viewing.
  const settings = await Settings.findOneAndUpdate(
    { owner: req.user._id },
    { $set: req.body },
    { new: true, upsert: true }
  );
  res.json(settings);
});

export default router;
