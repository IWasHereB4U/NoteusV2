import mongoose from 'mongoose';

// File repository entry: any uploaded file (picture, PDF, spreadsheet, ...).
// Tasks attach files from here, so one upload can be reused and managed in
// one place.
const fileAssetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true }, // filename on disk under /uploads
    mimeType: { type: String, default: 'application/octet-stream' },
    // image | video | audio | document | other — drives the icon/preview.
    kind: { type: String, enum: ['image', 'video', 'audio', 'document', 'other'], default: 'other' },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

fileAssetSchema.virtual('url').get(function () {
  return `/uploads/${this.storedName}`;
});
fileAssetSchema.set('toJSON', { virtuals: true });

export default mongoose.model('FileAsset', fileAssetSchema);
