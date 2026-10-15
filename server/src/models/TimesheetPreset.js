import mongoose from 'mongoose';

// A reusable work-day template: start/end times plus an ordered list of
// tasks and timeskips. Task shape mirrors TimesheetDay's task subdocument
// so a preset can be applied to a new day as-is (the server assigns fresh
// _ids when the day is created).
const presetTaskSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['task', 'timeskip'], default: 'task' },
    title: { type: String, required: true },
    detail: String,
    hours: { type: Number, min: 0, default: 0 },
    minutes: { type: Number, min: 0, max: 59, default: 0 },
    billable: { type: Boolean, default: false },
    startTime: String,
    endTime: String,
  },
  { _id: false }
);

const timesheetPresetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    startTime: String, // HH:MM
    endTime: String,
    tasks: [presetTaskSchema],
  },
  { timestamps: true }
);

export default mongoose.model('TimesheetPreset', timesheetPresetSchema);
