import mongoose from 'mongoose';

export const MEETING_STATUSES = ['Not Completed', 'Ongoing', 'Completed', 'Cancelled'];

const meetingSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    date: String,
    startTime: String,
    endTime: String,
    location: String, // optional
    notes: String,
    status: { type: String, enum: MEETING_STATUSES, default: 'Not Completed' },
  },
  { timestamps: true }
);

export default mongoose.model('Meeting', meetingSchema);
