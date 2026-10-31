import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import Poi from '../models/Poi.js';
import NoteTag from '../models/NoteTag.js';

// Same sharing gate as the other modules (the owner's per-person "poi"
// toggle). Unlike the generic CRUD factory this copies only known fields
// from the body and runs the schema validators on update, so a request can't
// re-assign `owner` or store a malformed schedule.
const router = Router();
router.use(requireAuth, resolveViewer, requireModuleShared('poi'));

const FIELDS = ['name', 'description', 'place', 'imageUrl', 'tags', 'schedule'];

function pick(body) {
  const out = {};
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// Only keep tags that really belong to this owner.
async function ownTags(ownerId, ids) {
  if (!Array.isArray(ids)) return [];
  const found = await NoteTag.find({ owner: ownerId, _id: { $in: ids } }).select('_id');
  return found.map((t) => t._id);
}

// A schedule must be internally consistent, and fields that belong to the
// other mode are dropped so stale values never linger after a mode switch.
function cleanSchedule(s) {
  if (!s || s.mode === 'none' || !s.mode) return { mode: 'none', days: [] };
  if (s.mode === 'daily') {
    const seen = new Set();
    const days = (Array.isArray(s.days) ? s.days : []).filter((d) => {
      if (seen.has(d.day)) return false;
      seen.add(d.day);
      return true;
    });
    if (days.length === 0) throw Object.assign(new Error('Pick at least one day'), { status: 400 });
    return { mode: 'daily', days: days.map(({ day, start, end }) => ({ day, start, end })) };
  }
  if (s.mode === 'once') {
    const { startDate, endDate, startTime, endTime } = s;
    if (!startDate || !endDate || !startTime || !endTime) {
      throw Object.assign(new Error('One-time schedule needs start/end day and start/end time'), { status: 400 });
    }
    if (endDate < startDate) {
      throw Object.assign(new Error('End day is before the start day'), { status: 400 });
    }
    return { mode: 'once', days: [], startDate, endDate, startTime, endTime };
  }
  throw Object.assign(new Error('Unknown schedule mode'), { status: 400 });
}

async function build(req) {
  const data = pick(req.body);
  if (data.tags !== undefined) data.tags = await ownTags(req.ownerId, data.tags);
  if (data.schedule !== undefined) data.schedule = cleanSchedule(data.schedule);
  // Only paths of files uploaded through this app are accepted.
  if (data.imageUrl && !/^\/uploads\/[\w.-]+$/.test(data.imageUrl)) {
    throw Object.assign(new Error('Invalid image'), { status: 400 });
  }
  return data;
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
      throw err;
    }
  };
}

router.get('/', async (req, res) => {
  res.json(await Poi.find({ owner: req.ownerId }).sort('name').lean());
});

router.post('/', requireOwnWrite, handle(async (req, res) => {
  const poi = await Poi.create({ ...(await build(req)), owner: req.ownerId });
  res.status(201).json(poi);
}));

router.put('/:id', requireOwnWrite, handle(async (req, res) => {
  const poi = await Poi.findOneAndUpdate(
    { _id: req.params.id, owner: req.ownerId },
    await build(req),
    { new: true, runValidators: true }
  );
  if (!poi) return res.status(404).json({ error: 'Not found' });
  res.json(poi);
}));

router.delete('/:id', requireOwnWrite, async (req, res) => {
  const poi = await Poi.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!poi) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
