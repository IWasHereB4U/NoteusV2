import { Router } from 'express';
import { requireAuth, resolveViewer, requireModuleShared } from '../middleware/auth.js';
import NoteCard from '../models/NoteCard.js';
import NoteFolder from '../models/NoteFolder.js';
import User from '../models/User.js';

const router = Router();
// Notes previously had no per-module gate here, so any accepted circle
// member could read a book's notes regardless of the owner's sharing
// toggle for that module. Comments make that gap load-bearing (a
// commenter needs to actually be allowed into Notes), so it's closed here.
router.use(requireAuth, resolveViewer, requireModuleShared('notes'));

function isOwner(req) {
  return String(req.ownerId) === String(req.user._id);
}
function idIn(list, userId) {
  return (list || []).some((id) => String(id) === String(userId));
}

// Same validation as noteFolders.js's version — only the owner can ever
// reach the code path that calls this, but the id list is still
// client-supplied, so it's filtered down to real accepted circle members
// rather than trusted as-is.
async function filterToCircleMembers(ownerId, ids) {
  if (!Array.isArray(ids)) return undefined;
  const owner = await User.findById(ownerId).select('circle');
  const accepted = new Set(
    (owner?.circle || []).filter((c) => c.status === 'accepted').map((c) => String(c.user))
  );
  return ids.filter((id) => accepted.has(String(id))).map((id) => id);
}

// A card is editable by someone other than the owner if they're on
// either editors list — the folder's (broad: every card inside it) or
// the card's own (narrow: just this one). Folder-level is the stronger
// grant: it also covers create/delete, which card-level deliberately
// does not (see the PUT/DELETE handlers below for why).

router.get('/', async (req, res) => {
  const { folder } = req.query;
  if (!folder) return res.status(400).json({ error: 'folder query param required' });
  const cards = await NoteCard.find({ owner: req.ownerId, folder }).sort('-updatedAt');
  const owner = isOwner(req);
  const folderDoc = owner ? null : await NoteFolder.findOne({ _id: folder, owner: req.ownerId });
  const hasFolderAccess = owner || (folderDoc && idIn(folderDoc.editors, req.user._id));
  res.json(
    cards.map((c) => ({
      ...c.toObject(),
      canEdit: owner || hasFolderAccess || idIn(c.editors, req.user._id),
      canDelete: owner || hasFolderAccess,
    }))
  );
});

router.get('/:id', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });
  if (isOwner(req)) return res.json({ ...card.toObject(), canEdit: true, canDelete: true });
  const folder = await NoteFolder.findOne({ _id: card.folder, owner: req.ownerId });
  const hasFolderAccess = !!(folder && idIn(folder.editors, req.user._id));
  res.json({
    ...card.toObject(),
    canEdit: hasFolderAccess || idIn(card.editors, req.user._id),
    canDelete: hasFolderAccess,
  });
});

// Creating a card requires folder-level access — there's no such thing
// as a card-level grant for a card that doesn't exist yet.
router.post('/', async (req, res) => {
  const { folder, mode, title } = req.body;
  if (!folder || !mode) return res.status(400).json({ error: 'folder and mode are required' });
  if (!isOwner(req)) {
    const folderDoc = await NoteFolder.findOne({ _id: folder, owner: req.ownerId });
    if (!folderDoc) return res.status(404).json({ error: 'Folder not found' });
    if (!idIn(folderDoc.editors, req.user._id)) {
      return res.status(403).json({ error: "You don't have edit access to this folder" });
    }
  }
  const card = await NoteCard.create({
    owner: req.ownerId,
    folder,
    mode,
    title: title || 'Untitled',
    elements: mode === 'free' ? [] : undefined,
    html: mode === 'fixed' ? '' : undefined,
  });
  res.status(201).json(card);
});

router.put('/:id', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });

  if (isOwner(req)) {
    const body = { ...req.body };
    if (body.editors !== undefined) {
      body.editors = await filterToCircleMembers(req.ownerId, body.editors);
    }
    const updated = await NoteCard.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, body, { new: true });
    return res.json(updated);
  }

  // Non-owner: content only, and only for whichever grant applies.
  // Folder-level and card-level editors get the exact same content
  // fields — the difference between them is create/delete access, not
  // what "content" means — but neither can touch `folder` (move),
  // `editors` (re-grant), `mode`, or `owner`, since those are
  // organizational/permission changes, not content edits.
  const folder = await NoteFolder.findOne({ _id: card.folder, owner: req.ownerId });
  const canEditContent = (folder && idIn(folder.editors, req.user._id)) || idIn(card.editors, req.user._id);
  if (!canEditContent) return res.status(403).json({ error: "You don't have edit access to this note" });

  const safe = {};
  if (typeof req.body.title === 'string') safe.title = req.body.title;
  if (typeof req.body.html === 'string') safe.html = req.body.html;
  if (Array.isArray(req.body.elements)) safe.elements = req.body.elements;
  const updated = await NoteCard.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, safe, { new: true });
  res.json(updated);
});

// Only folder-level editors (or the owner) can delete — a card-only
// grant is meant for "edit this doc's content", not "you can remove it".
router.delete('/:id', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });
  if (!isOwner(req)) {
    const folder = await NoteFolder.findOne({ _id: card.folder, owner: req.ownerId });
    if (!folder || !idIn(folder.editors, req.user._id)) {
      return res.status(403).json({ error: "You don't have delete access to this note" });
    }
  }
  await NoteCard.deleteOne({ _id: req.params.id, owner: req.ownerId });
  res.json({ ok: true });
});

// Comments are the one thing ANY circle member with notes access can
// write, even without an editors grant — that's the whole point of
// sharing a note to gather feedback on it. The permission checks above
// (owner, folder editor, card editor) don't apply here at all; being
// able to comment is independent of being able to edit content.
router.post('/:id/comments', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text is required' });
  card.comments.push({
    author: req.user._id,
    authorName: req.user.name,
    authorColor: req.user.color,
    text,
    anchor: req.body.anchor || { type: 'card' },
  });
  await card.save();
  res.status(201).json(card);
});

// Editing/resolving/deleting a comment is restricted to whoever wrote it,
// or the book's owner (moderating their own note) — being able to view and
// add comments doesn't extend to touching someone else's.
router.put('/:id/comments/:commentId', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });
  const comment = card.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  const canModify = String(comment.author) === String(req.user._id) || String(req.ownerId) === String(req.user._id);
  if (!canModify) return res.status(403).json({ error: "You can't edit this comment" });
  if (typeof req.body.text === 'string' && req.body.text.trim()) comment.text = req.body.text.trim();
  if (typeof req.body.resolved === 'boolean') comment.resolved = req.body.resolved;
  await card.save();
  res.json(card);
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  const card = await NoteCard.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!card) return res.status(404).json({ error: 'Not found' });
  const comment = card.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  const canModify = String(comment.author) === String(req.user._id) || String(req.ownerId) === String(req.user._id);
  if (!canModify) return res.status(403).json({ error: "You can't delete this comment" });
  card.comments.pull({ _id: req.params.commentId });
  await card.save();
  res.json(card);
});

export default router;
