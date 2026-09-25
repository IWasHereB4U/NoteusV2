import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    due: String,
    done: { type: Boolean, default: false },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
