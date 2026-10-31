import mongoose from 'mongoose';

// Point of Interest module.
// A POI is a named spot on the map with an optional photo, a description,
// categories (the same NoteTag labels used by the Note Tag module) and an
// optional schedule saying when it is open / happening.

const placeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lon: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM, 24h
const DATE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

// Daily mode: a weekly pattern. Each entry is one weekday (0 = Sunday …
// 6 = Saturday, same as Date#getDay) with its own opening hours.
const daySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    start: { type: String, required: true, match: TIME },
    end: { type: String, required: true, match: TIME },
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    // 'none'  – no schedule (a landmark that is simply always there)
    // 'daily' – repeats every week on the chosen weekdays
    // 'once'  – a one-time run: a date range plus a time range
    mode: { type: String, enum: ['none', 'daily', 'once'], default: 'none' },
    days: { type: [daySchema], default: [] },
    startDate: { type: String, match: DATE },
    endDate: { type: String, match: DATE },
    startTime: { type: String, match: TIME },
    endTime: { type: String, match: TIME },
  },
  { _id: false }
);

const poiSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    place: { type: placeSchema, required: true },
    // Server-relative path of an uploaded image (e.g. /uploads/abc.png) from
    // the shared media library. Empty = the map shows a plain POI icon.
    imageUrl: { type: String, default: '' },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'NoteTag' }],
    schedule: { type: scheduleSchema, default: () => ({ mode: 'none' }) },
  },
  { timestamps: true }
);

export default mongoose.model('Poi', poiSchema);
