import mongoose from 'mongoose';

const mediaAssetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: String,
    storedName: { type: String, required: true }, // filename on disk under /uploads
    mimeType: String,
    kind: { type: String, enum: ['image', 'video'], required: true },
    size: Number,
  },
  { timestamps: true }
);

mediaAssetSchema.virtual('url').get(function () {
  return `/uploads/${this.storedName}`;
});
mediaAssetSchema.set('toJSON', { virtuals: true });

export default mongoose.model('MediaAsset', mediaAssetSchema);
