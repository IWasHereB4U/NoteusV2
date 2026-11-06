import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import Bank from '../models/Bank.js';
import BankHistory from '../models/BankHistory.js';

// Bankbook is two resources — banks and their history rows — so it gets its
// own routes instead of the generic resourceRouter: history rows must point
// at a bank the owner really has, deleting a bank has to take its history
// with it, and bank balances are sensitive enough that the "bankbook"
// circle-sharing toggle is enforced here on the server, not just in the UI.
const guard = [requireAuth, resolveViewer, requireModuleShared('bankbook')];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---- Banks ----------------------------------------------------------------

export const banksRouter = Router();
banksRouter.use(...guard);

async function nameTaken(owner, name, exceptId) {
  const q = { owner, name: new RegExp(`^${escapeRe(name)}$`, 'i') };
  if (exceptId) q._id = { $ne: exceptId };
  return !!(await Bank.exists(q));
}

banksRouter.get('/', async (req, res) => {
  res.json(await Bank.find({ owner: req.ownerId }).sort('name').lean());
});

banksRouter.post('/', requireOwnWrite, async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Bank name is required' });
  if (await nameTaken(req.ownerId, name)) {
    return res.status(409).json({ error: 'You already have a bank with that name' });
  }
  const doc = await Bank.create({ owner: req.ownerId, name });
  res.status(201).json(doc);
});

banksRouter.put('/:id', requireOwnWrite, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Bank name is required' });
  if (await nameTaken(req.ownerId, name, req.params.id)) {
    return res.status(409).json({ error: 'You already have a bank with that name' });
  }
  const doc = await Bank.findOneAndUpdate(
    { _id: req.params.id, owner: req.ownerId },
    { name },
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});

// Deleting a bank also deletes its history, so no row is left pointing at
// a bank that no longer exists.
banksRouter.delete('/:id', requireOwnWrite, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const doc = await Bank.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  await BankHistory.deleteMany({ owner: req.ownerId, bankId: doc._id });
  res.json({ ok: true });
});

// ---- Bank history ---------------------------------------------------------

export const bankHistoriesRouter = Router();
bankHistoriesRouter.use(...guard);

// Whitelists the three editable fields (so a request can't re-point `owner`)
// and checks the bank belongs to the book being written to.
async function readHistoryBody(req) {
  const { bankId, date, amount } = req.body;
  if (!mongoose.isValidObjectId(bankId) || !(await Bank.exists({ _id: bankId, owner: req.ownerId }))) {
    return { error: 'Pick one of your banks' };
  }
  if (!isRealDate(String(date ?? ''))) return { error: 'A valid date is required' };
  const n = Number(amount);
  if (amount === '' || amount === null || amount === undefined || !Number.isFinite(n)) {
    return { error: 'Amount must be a number' };
  }
  return { data: { bankId, date, amount: n } };
}

bankHistoriesRouter.get('/', async (req, res) => {
  const q = { owner: req.ownerId };
  if (req.query.bankId && mongoose.isValidObjectId(req.query.bankId)) q.bankId = req.query.bankId;
  res.json(await BankHistory.find(q).sort({ date: -1, createdAt: -1 }).lean());
});

bankHistoriesRouter.post('/', requireOwnWrite, async (req, res) => {
  const { data, error } = await readHistoryBody(req);
  if (error) return res.status(400).json({ error });
  const doc = await BankHistory.create({ ...data, owner: req.ownerId });
  res.status(201).json(doc);
});

bankHistoriesRouter.put('/:id', requireOwnWrite, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const { data, error } = await readHistoryBody(req);
  if (error) return res.status(400).json({ error });
  const doc = await BankHistory.findOneAndUpdate(
    { _id: req.params.id, owner: req.ownerId },
    data,
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});

bankHistoriesRouter.delete('/:id', requireOwnWrite, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const doc = await BankHistory.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
