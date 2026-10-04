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
    // Note Tag words used as this meeting's tags (sort / filter / group on
    // the Meetings page). A word's own Note Tags act as its category.
    tagWords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TagWord' }],
  },
  { timestamps: true }
);

export default mongoose.model('Meeting', meetingSchema);
