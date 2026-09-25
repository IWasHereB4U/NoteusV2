import { Router } from 'express';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import RecurringRule from '../models/RecurringRule.js';
import Transaction from '../models/Transaction.js';

const router = Router();
router.use(requireAuth, resolveViewer, requireModuleShared('money'));

router.get('/', async (req, res) => {
  const rules = await RecurringRule.find({ owner: req.ownerId }).sort('-createdAt');
  res.json(rules);
});

router.post('/', requireOwnWrite, async (req, res) => {
  const rule = await RecurringRule.create({ ...req.body, owner: req.ownerId });
  res.status(201).json(rule);
});

router.put('/:id', requireOwnWrite, async (req, res) => {
  const rule = await RecurringRule.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, req.body, { new: true });
  if (!rule) return res.status(404).json({ error: 'Not found' });
  res.json(rule);
});

router.delete('/:id', requireOwnWrite, async (req, res) => {
  const rule = await RecurringRule.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!rule) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Materializes every due occurrence (up to and including today) into real
// Transaction rows, and separately promotes any already-pending
// transaction whose date has arrived (or passed) to paid. There's no
// background scheduler in this app, so the client calls this whenever the
// Money page loads — a catch-up on demand rather than a cron worker,
// self-healing even after the app's been closed for a while.
//
// `today` is accepted from the client (its own local YYYY-MM-DD) rather
// than computed here from the server's clock: this server may run in UTC,
// and a user well ahead of UTC (e.g. the Philippines, UTC+8) would
// otherwise see today's occurrences — and today's pending → paid flips —
// lag behind by several hours each day, right up until UTC's date rolls
// over. Falls back to the server's own UTC date if the client didn't send
// one, so older client builds don't break.
router.post('/run', requireOwnWrite, async (req, res) => {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.body.todayDate)
    ? req.body.todayDate
    : new Date().toISOString().slice(0, 10);

  const rules = await RecurringRule.find({ owner: req.ownerId, active: true });
  let created = 0;

  for (const rule of rules) {
    const dates = occurrencesDue(rule, today);
    if (dates.length === 0) continue;
    await Transaction.insertMany(
      dates.map((date) => ({
        owner: req.ownerId,
        type: rule.type,
        date,
        category: rule.category,
        note: rule.note,
        amount: rule.amount,
        status: rule.status,
        recurringRuleId: rule._id,
      }))
    );
    created += dates.length;
    rule.lastGenerated = dates[dates.length - 1];
    await rule.save();
  }

  // Passive day-by-day promotion: a transaction (recurring-generated or
  // hand-entered) left as "pending" for a date that's now here or gone
  // reads as settled going forward, not stuck pending forever. This does
  // NOT touch anything dated after today — those stay pending exactly as
  // set. Runs unconditionally, independent of whether any recurring rule
  // exists, since plenty of pending entries are entered by hand.
  const reconciled = await Transaction.updateMany(
    { owner: req.ownerId, status: 'pending', date: { $lte: today } },
    { $set: { status: 'paid' } }
  );

  res.json({ created, reconciled: reconciled.modifiedCount || 0 });
});

// Every date the rule is due for, strictly after lastGenerated (or from
// startDate if it's never run), up to `today` and not past any endDate.
function occurrencesDue(rule, today) {
  const out = [];
  const cursor = rule.lastGenerated ? addDays(rule.lastGenerated, 1) : rule.startDate;
  const stop = rule.endDate && rule.endDate < today ? rule.endDate : today;
  if (cursor > stop) return out;

  if (rule.frequency.kind === 'everyNDays') {
    // Walk from startDate in fixed N-day steps so the cadence stays
    // anchored to startDate even if lastGenerated skipped past several.
    let d = rule.startDate;
    while (d <= stop) {
      if (d >= cursor) out.push(d);
      d = addDays(d, rule.frequency.n);
    }
    return out;
  }

  // monthlyDay / eom — walk month by month.
  let [y, m] = cursor.split('-').map(Number);
  for (let guard = 0; guard < 1200; guard++) { // ~100 years, just a sanity cap
    const occurrence = rule.frequency.kind === 'eom' ? lastDayOfMonth(y, m) : clampedDay(y, m, rule.frequency.day);
    if (occurrence > stop) break;
    if (occurrence >= cursor) out.push(occurrence);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function clampedDay(y, m, day) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(day, last))).toISOString().slice(0, 10);
}

export default router;