import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import Task from '../models/Task.js';

// Two things the plain CRUD router can't do for tasks:
//   PUT /api/tasks/reorder      — save a hand-sorted order (drag and drop)
//   PUT /api/tasks/:id/verify   — let someone ELSE in the owner's circle tick
//                                 the second ("verified") box on one item.
// Mounted before resourceRouter so these paths win over PUT /:id. Auth is
// attached per route (not router.use) so every other /api/tasks request
// falls straight through without being authenticated twice.
const router = Router();
const guard = [requireAuth, resolveViewer, requireModuleShared('tasks')];

router.put('/reorder', ...guard, requireOwnWrite, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : null;
  if (!ids || ids.length > 5000 || !ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ error: 'ids must be a list of task ids' });
  }
  if (ids.length) {
    await Task.bulkWrite(
      ids.map((id, i) => ({
        updateOne: { filter: { _id: id, owner: req.ownerId }, update: { $set: { order: i } } },
      }))
    );
  }
  res.json({ ok: true });
});

// --- second-box logic (server copy of toggleVerifyBox for 'check2') ---------
const kids = (it) => it.children || [];

function findItem(items, id) {
  for (const it of items) {
    if (it.id === id) return it;
    const hit = findItem(kids(it), id);
    if (hit) return hit;
  }
  return null;
}

// Every node at or under `item` that currently has the box ticked.
function tickedUnder(item, out = []) {
  if (item.check2) out.push(item);
  kids(item).forEach((c) => tickedUnder(c, out));
  return out;
}

function setSubtree(it, value, by) {
  const next = { ...it, children: kids(it).map((c) => setSubtree(c, value, by)) };
  if (value) {
    // Keep the original stamp on anything already ticked.
    if (!it.check2) next.check2By = by;
  } else {
    delete next.check2By;
  }
  next.check2 = value;
  return next;
}

function toggleCheck2(items, id, by) {
  const walk = (list) =>
    list.map((it) => {
      if (it.id === id) return setSubtree(it, !it.check2, by);
      const children = walk(kids(it));
      if (!children.length) return it; // not on this branch and a leaf: untouched
      const derived = children.every((c) => c.check2);
      const next = { ...it, children, check2: derived };
      if (derived && !it.check2) next.check2By = by;
      if (!derived) delete next.check2By;
      return next;
    });
  const withDone = (list) =>
    list.map((it) => ({ ...it, children: withDone(kids(it)), done: !!(it.check1 && it.check2) }));
  return withDone(walk(items));
}

router.put('/:id/verify', ...guard, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const itemId = String(req.body.itemId || '');
  const task = await Task.findOne({ _id: req.params.id, owner: req.ownerId });
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (!task.needsVerification) return res.status(400).json({ error: "This task doesn't use verification" });

  const checklist = task.checklist || [];
  const target = findItem(checklist, itemId);
  if (!target) return res.status(404).json({ error: 'Checklist item not found' });

  const me = String(req.user._id);
  const isOwner = String(req.ownerId) === me;
  // Unticking: people can only take back their own tick, so one person can't
  // quietly wipe out another person's verification. The owner can untick any.
  if (target.check2 && !isOwner) {
    const foreign = tickedUnder(target).some((n) => n.check2By?.id !== me);
    if (foreign) {
      return res.status(403).json({ error: 'Only the person who ticked this can untick it' });
    }
  }

  const by = { id: me, name: req.user.name, at: new Date().toISOString() };
  task.checklist = toggleCheck2(checklist, itemId, by);
  task.markModified('checklist');
  await task.save();
  res.json(task);
});

export default router;
