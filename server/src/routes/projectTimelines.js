import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import { makeCrud } from '../controllers/crudFactory.js';
import ProjectTimeline, { PHASE_STATUSES } from '../models/ProjectTimeline.js';

// MGOctaviano07Oct2026 — Project Timeline module.
// Same shape as mapDestinations: gated by the owner's per-person
// "projecttimeline" sharing toggle, reads for the circle, writes owner-only.
const router = Router();
const crud = makeCrud(ProjectTimeline, { sortBy: 'name' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Whitelists the body (so a PUT can't overwrite `owner`) and validates the
// phases: known status, at most one phase per status, a required start date,
// well-formed dates, and no deadline/finish before the start.
function cleanBody(req, res, next) {
  const { name, color, notes, phases } = req.body || {};
  const out = {};

  if (req.method === 'POST' || name !== undefined) {
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Project name is required' });
    out.name = String(name).trim();
  }
  if (color !== undefined) {
    if (color && !HEX_RE.test(color)) return res.status(400).json({ error: 'Color must be a hex value like #F08A24' });
    if (color) out.color = color;
  }
  if (notes !== undefined) out.notes = String(notes || '');

  if (phases !== undefined) {
    if (!Array.isArray(phases)) return res.status(400).json({ error: 'phases must be a list' });
    const seen = new Set();
    out.phases = [];
    for (const p of phases) {
      if (!PHASE_STATUSES.includes(p?.status)) return res.status(400).json({ error: `Status must be one of: ${PHASE_STATUSES.join(', ')}` });
      if (seen.has(p.status)) return res.status(400).json({ error: `Only one "${p.status}" entry per project` });
      seen.add(p.status);
      if (!DATE_RE.test(p.startDate || '')) return res.status(400).json({ error: `${p.status}: a start date is required` });
      const phase = { status: p.status, startDate: p.startDate };
      for (const k of ['deadlineDate', 'finishedDate']) {
        if (p[k]) {
          if (!DATE_RE.test(p[k])) return res.status(400).json({ error: `${p.status}: invalid ${k}` });
          if (p[k] < p.startDate) return res.status(400).json({ error: `${p.status}: ${k === 'deadlineDate' ? 'deadline' : 'finished date'} is before the start date` });
          phase[k] = p[k];
        }
      }
      out.phases.push(phase);
    }
  }

  req.body = out;
  next();
}

router.use(requireAuth, resolveViewer, requireModuleShared('projecttimeline'));
router.get('/', crud.list);
router.post('/', requireOwnWrite, cleanBody, crud.create);
router.put('/:id', requireOwnWrite, cleanBody, crud.update);
router.delete('/:id', requireOwnWrite, crud.remove);

export default router;
