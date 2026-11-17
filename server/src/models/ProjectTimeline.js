import mongoose from 'mongoose';

// MGOctaviano07Oct2026 — Project Timeline module.
//
// One document per project. Each project carries up to one phase per status,
// and the statuses form a pipeline. The ORDER OF THIS LIST IS THE SORT ORDER
// used everywhere (phases are saved in this order, the client sorts by it).
// A phase is its own bar on the timeline and has the three dates the module
// tracks: start, deadline, finished. Dates are YYYY-MM-DD strings.
export const PHASE_STATUSES = [
  'Functional Specification',
  'Development',
  'Unit Testing',
  'System Integration',
  'UAT Script',
  'User Acceptance Test',
  'UAT Signoff',
  'Deployment',
];

// The module used to have only two statuses. Rows saved back then still carry
// the old names; they map onto their closest new status (see
// scripts/migrateTimelineStatuses.js to rewrite them in the database).
export const LEGACY_STATUS = { 'Coding Fix': 'Development', UT: 'Unit Testing' };

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
    // The project's own color. Shown as an accent in "Color by status" mode and
    // used (graded from full color to lighter tints, one per status) in
    // "Color by project" mode — computed on the client.
    color: { type: String, default: '#F08A24' },
    notes: String,
    phases: [phaseSchema],
  },
  { timestamps: true }
);

export default mongoose.model('ProjectTimeline', projectTimelineSchema);
