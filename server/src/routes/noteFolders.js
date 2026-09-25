import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import NoteFolder from '../models/NoteFolder.js';
import NoteCard from '../models/NoteCard.js';
import User from '../models/User.js';

const router = Router();
router.use(requireAuth, resolveViewer, requireModuleShared('notes'));

// Defense in depth: even though only the owner can ever call the route
// that sets `editors` (requireOwnWrite), an id list built client-side
// could contain anything — filter it down to people actually in the
// owner's accepted circle, so an editors list can never smuggle in
// someone who was never granted circle access at all.
async function filterToCircleMembers(ownerId, ids) {
  if (!Array.isArray(ids)) return undefined;
  const owner = await User.findById(ownerId).select('circle');
  const accepted = new Set(
    (owner?.circle || []).filter((c) => c.status === 'accepted').map((c) => String(c.user))
  );
  return ids.filter((id) => accepted.has(String(id))).map((id) => id);
}

// Whole tree at once (flat list with `parent` pointers) — the client
// assembles it into a tree. Simpler than a nested endpoint and lets the
// sidebar re-render instantly on any single change.
router.get('/', async (req, res) => {
  const folders = await NoteFolder.find({ owner: req.ownerId }).sort('name');
  const isOwner = String(req.ownerId) === String(req.user._id);
  res.json(
    folders.map((f) => ({
      ...f.toJSON(),
      canEdit: isOwner || f.editors.some((id) => String(id) === String(req.user._id)),
    }))
  );
});

router.post('/', requireOwnWrite, async (req, res) => {
  const { name, parent, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder needs a name' });
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const folder = await NoteFolder.create({ owner: req.ownerId, name, parent: parent || null, passwordHash });
  res.status(201).json(folder);
});

router.put('/:id', requireOwnWrite, async (req, res) => {
  const { name, password, clearPassword, editors } = req.body;
  const update = {};
  if (name) update.name = name;
  if (clearPassword) update.passwordHash = null;
  else if (password) update.passwordHash = await bcrypt.hash(password, 10);
  if (editors !== undefined) {
    update.editors = await filterToCircleMembers(req.ownerId, editors);
  }

  const folder = await NoteFolder.findOneAndUpdate(
    { _id: req.params.id, owner: req.ownerId },
    update,
    { new: true }
  );
  if (!folder) return res.status(404).json({ error: 'Not found' });
  res.json(folder);
});

// Verifies a folder's password. Doesn't issue a token — the client just
// remembers which folder ids it has unlocked for the current session.
router.post('/:id/unlock', async (req, res) => {
  const folder = await NoteFolder.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!folder) return res.status(404).json({ error: 'Not found' });
  const ok = await folder.checkPassword(req.body.password);
  if (!ok) return res.status(403).json({ error: 'Wrong password' });
  res.json({ ok: true });
});

// Deleting a folder cascades to its subfolders and their cards, since an
// orphaned folder with no parent would otherwise be unreachable in the tree.
router.delete('/:id', requireOwnWrite, async (req, res) => {
  const toDelete = [req.params.id];
  for (let i = 0; i < toDelete.length; i++) {
    const children = await NoteFolder.find({ owner: req.ownerId, parent: toDelete[i] });
    children.forEach((c) => toDelete.push(String(c._id)));
  }
  await NoteCard.deleteMany({ owner: req.ownerId, folder: { $in: toDelete } });
  await NoteFolder.deleteMany({ owner: req.ownerId, _id: { $in: toDelete } });
  res.json({ ok: true });
});

export default router;
