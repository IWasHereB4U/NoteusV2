// Every ledger resource (clients, transactions, tasks, meetings, filings)
// follows the same shape: list/create/update/delete scoped to req.ownerId,
// which resolveViewer has already permission-checked. This factory avoids
// writing the same five handlers five times.
export function makeCrud(Model, { sortBy = '-createdAt' } = {}) {
  // .lean() skips building full Mongoose documents for every row, which is
  // most of the CPU in a list request. Models with a custom toJSON (e.g.
  // a `total` virtual) keep full documents so their JSON shape
  // doesn't change.
  const useLean = !Model.schema.options.toJSON;

  return {
    async list(req, res) {
      const q = Model.find({ owner: req.ownerId }).sort(sortBy);
      const docs = useLean ? await q.lean() : await q;
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
