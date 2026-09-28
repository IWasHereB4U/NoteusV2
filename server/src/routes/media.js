import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireAuth, resolveViewer, requireOwnWrite } from '../middleware/auth.js';
import MediaAsset from '../models/MediaAsset.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '../../uploads');
// Vercel's filesystem is read-only (and wiped between instances), so this
// can throw there. Don't let it take down the whole API at cold start —
// uploads just won't persist on Vercel; use Vercel Blob / Cloudinary / S3
// for media if the API stays on Vercel.
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  console.warn('[media] upload dir not writable here:', err.code);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const ALLOWED = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|video\/(mp4|webm|quicktime|ogg))$/;
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB, generous for short video clips
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.test(file.mimetype)) return cb(new Error('Only images and videos are allowed'));
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth, resolveViewer);

router.get('/', async (req, res) => {
  const assets = await MediaAsset.find({ owner: req.ownerId }).sort('-createdAt');
  res.json(assets);
});

router.post('/upload', requireOwnWrite, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    const kind = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    const asset = await MediaAsset.create({
      owner: req.ownerId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      kind,
      size: req.file.size,
    });
    res.status(201).json(asset);
  });
});

router.delete('/:id', requireOwnWrite, async (req, res) => {
  const asset = await MediaAsset.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
  if (!asset) return res.status(404).json({ error: 'Not found' });
  fs.unlink(path.join(UPLOAD_DIR, asset.storedName), () => {});
  res.json({ ok: true });
});

export default router;
