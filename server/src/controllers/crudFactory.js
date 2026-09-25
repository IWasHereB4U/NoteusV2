// Every ledger resource (clients, transactions, tasks, meetings, filings)
// follows the same shape: list/create/update/delete scoped to req.ownerId,
// which resolveViewer has already permission-checked. This factory avoids
// writing the same five handlers five times.
export function makeCrud(Model, { sortBy = '-createdAt' } = {}) {
  return {
    async list(req, res) {
      const docs = await Model.find({ owner: req.ownerId }).sort(sortBy);
      res.json(docs);
    },

    async create(req, res) {
      const doc = await Model.create({ ...req.body, owner: req.ownerId });
      res.status(201).json(doc);
    },

    async update(req, res) {
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, owner: req.ownerId },
        req.body,
        { new: true }
      );
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);
    },

    async remove(req, res) {
      const doc = await Model.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    },
  };
}
