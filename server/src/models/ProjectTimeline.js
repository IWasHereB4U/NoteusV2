import mongoose from 'mongoose';

// MGOctaviano07Oct2026 — Project Timeline module.
//
// One document per project. Each project carries up to two phases, one per
// status: 'Coding Fix' and 'UT'. A phase is its own bar on the timeline and
// has the three dates the module tracks: start, deadline, finished.
// Dates are YYYY-MM-DD strings, same as the rest of the book.
export const PHASE_STATUSES = ['Coding Fix', 'UT'];

const phaseSchema = new mongoose.Schema(
  {
    status: { type: String, enum: PHASE_STATUSES, required: true },
    startDate: { type: String, required: true },
    deadlineDate: String,
    finishedDate: String,
  },
  { _id: false }
);

const projectTimelineSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Base color of the project. 'Coding Fix' uses it as-is, 'UT' uses a
    // lighter tint of the same hue — computed on the client.
    color: { type: String, default: '#F08A24' },
    notes: String,
    phases: [phaseSchema],
  },
  { timestamps: true }
);

export default mongoose.model('ProjectTimeline', projectTimelineSchema);
