import mongoose from 'mongoose';

// MGOctaviano04Oct2026 — Maps module.
// A Destination is a From -> To pair. It owns a list of Routes (different
// ways of getting there), and each Route owns an ordered list of Cards —
// one card per leg/ride (e.g. jeepney, then LRT, then tricycle).
// Everything is embedded rather than split into collections: a card has no
// meaning outside its route, and the whole destination is always loaded
// together. Subdocuments get their own _id so the client can address them.
export const TRANSPORT_MODES = [
  'Walk', 'Jeepney', 'Bus', 'UV Express', 'Tricycle', 'Train', 'Ferry',
  'Taxi / Ride-hailing', 'Motorcycle', 'Car', 'Plane', 'Other',
];

// Place coordinates come from OpenStreetMap's Nominatim search on the
// client; the label is the human-readable name the user picked.
const placeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema({
  mode: { type: String, enum: TRANSPORT_MODES, default: 'Jeepney' },
  name: { type: String, default: '' }, // e.g. "Antipolo–Cubao", "LRT-2"
  price: { type: Number, min: 0, default: 0 },
  dateUpdated: String, // YYYY-MM-DD — when the fare/info was last verified
  from: placeSchema,
  to: placeSchema,
});

const routeSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  cards: [cardSchema],
});

const destinationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    from: { type: placeSchema, required: true },
    to: { type: placeSchema, required: true },
    routes: [routeSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Destination', destinationSchema);
