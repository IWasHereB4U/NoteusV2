import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite } from '../middleware/auth.js';
import NoteTag from '../models/NoteTag.js';
import TagWord from '../models/TagWord.js';

// Deleting a tag also strips it off every word that carried it, so words
// never point at a tag that no longer exists. Mounted ahead of the
// generic resource router for /api/note-tags, which handles the rest.
const router = Router();

router.delete('/:id', requireAuth, resolveViewer, requireOwnWrite, async (req, res) => {
  const tag = await NoteTag.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!tag) return res.status(404).json({ error: 'Not found' });
  await TagWord.updateMany({ owner: req.ownerId, tags: tag._id }, { $pull: { tags: tag._id } });
  res.json({ ok: true });
});

export default router;
