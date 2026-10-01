import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite } from '../middleware/auth.js';
import TagWord from '../models/TagWord.js';
import Meeting from '../models/Meeting.js';

// Deleting a word also strips it off every meeting that used it as a tag,
// so meetings never point at a word that no longer exists. Mounted ahead
// of the generic resource router for /api/tag-words, which handles the rest.
const router = Router();

router.delete('/:id', requireAuth, resolveViewer, requireOwnWrite, async (req, res) => {
  const word = await TagWord.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!word) return res.status(404).json({ error: 'Not found' });
  await Meeting.updateMany({ owner: req.ownerId, tagWords: word._id }, { $pull: { tagWords: word._id } });
  res.json({ ok: true });
});

export default router;
