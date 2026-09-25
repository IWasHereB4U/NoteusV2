import mongoose from 'mongoose';

// Tasks live inside the work day they belong to — a day is the unit you
// create, a task is just time logged against it. Subdocuments get their
// own _id automatically, so the client can address/edit/remove one task
// without a separate collection or routes.
const timesheetTaskSchema = new mongoose.Schema(
  {
    // 'task' = normal logged work, counted toward hours/duration math.
    // 'timeskip' = a fixed-clock-time gap (lunch, appointment, etc) that
    // interrupts the day's schedule without counting as logged time.
    type: { type: String, enum: ['task', 'timeskip'], default: 'task' },
    title: { type: String, required: true },
    detail: String,
    hours: { type: Number, min: 0, default: 0 },
    minutes: { type: Number, min: 0, max: 59, default: 0 },
    billable: { type: Boolean, default: false },
    // Only set (and only meaningful) when type === 'timeskip' — a literal
    // HH:MM clock range rather than a duration.
    startTime: String,
    endTime: String,
  },
  { timestamps: true }
);

const timesheetDaySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: String, // HH:MM
    endTime: String,
    status: { type: String, enum: ['Draft', 'Pending', 'Approved', 'Revision'], default: 'Draft' },
    tasks: [timesheetTaskSchema],
  },
  { timestamps: true }
);

export default mongoose.model('TimesheetDay', timesheetDaySchema);