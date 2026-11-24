import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { requireAuth, resolveViewer, requireOwnWrite, requireModuleShared } from '../middleware/auth.js';
import FileAsset from '../models/FileAsset.js';
import Task from '../models/Task.js';
import { UPLOAD_DIR } from './media.js';

// File repository: any file type, stored next to the media uploads and
// served from /uploads (app.js forces non-media types to download rather
// than render, so an uploaded .html can't run in the API's origin).
const MAX_BYTES = 50 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!/^\.[a-z0-9]{1,10}$/.test(ext)) ext = '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_BYTES } });

// Browsers send UTF-8 file names; the multipart parser reads them as latin1.
const fixName = (n = '') => {
  try {
    return Buffer.from(n, 'latin1').toString('utf8');
  } catch {
    return n;
  }
};

function kindOf(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    /(word|excel|sheet|powerpoint|presentation|opendocument|rtf|csv|json)/i.test(mime)
  ) return 'document';
  return 'other';
}

const router = Router();
router.use(requireAuth, resolveViewer, requireModuleShared('files'));

router.get('/', async (req, res) => {
  const files = await FileAsset.find({ owner: req.ownerId }).sort('-createdAt');
  res.json(files);
});

router.post('/upload', requireOwnWrite, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 50 MB' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const asset = await FileAsset.create({
      owner: req.ownerId,
      originalName: fixName(req.file.originalname) || req.file.filename,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      kind: kindOf(req.file.mimetype),
      size: req.file.size,
    });
    res.status(201).json(asset);
  });
});

// Rename only — the stored file itself never changes.
router.put('/:id', requireOwnWrite, async (req, res) => {
  const name = String(req.body.originalName || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const asset = await FileAsset.findOneAndUpdate(
    { _id: req.params.id, owner: req.ownerId },
    { originalName: name },
    { new: true }
  );
  if (!asset) return res.status(404).json({ error: 'Not found' });
  // Tasks keep a copy of the name for display — keep them in step.
  await Task.updateMany(
    { owner: req.ownerId, 'attachments.fileId': String(asset._id) },
    { $set: { 'attachments.$[a].name': name } },
    { arrayFilters: [{ 'a.fileId': String(asset._id) }] }
  );
  res.json(asset);
});

router.delete('/:id', requireOwnWrite, async (req, res) => {
  const asset = await FileAsset.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!asset) return res.status(404).json({ error: 'Not found' });
  fs.unlink(path.join(UPLOAD_DIR, asset.storedName), () => {});
  // A deleted file must not linger as a broken attachment on tasks.
  await Task.updateMany(
    { owner: req.ownerId, 'attachments.fileId': String(asset._id) },
    { $pull: { attachments: { fileId: String(asset._id) } } }
  );
  res.json({ ok: true });
});

export default router;
