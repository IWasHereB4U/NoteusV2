import mongoose from 'mongoose';

export const CALENDAR_EVENT_STATUSES = ['Not Completed', 'Ongoing', 'Completed', 'Cancelled'];

const calendarEventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: String, // HH:MM, empty/absent = all-day
    endTime: String,
    allDay: { type: Boolean, default: false },
    color: { type: String, default: '#0E9C92' },
    location: String, // optional
    notes: String,
    status: { type: String, enum: CALENDAR_EVENT_STATUSES, default: 'Not Completed' },
  },
  { timestamps: true }
);

export default mongoose.model('CalendarEvent', calendarEventSchema);
