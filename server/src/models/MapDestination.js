import mongoose from 'mongoose';

// A named place, geocoded via OpenStreetMap (Nominatim). Stored as a plain
// {label, lat, lon} so the client can draw it and ask OSRM for a route
// without looking anything up again.
const placeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lon: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

// One leg of a route: "take <mode> (<name>) from A to B for <price>".
// Subdocuments get their own _id, so the client can edit/remove a single
// card without extra collections or routes (same pattern as TimesheetDay).
const cardSchema = new mongoose.Schema({
  mode: { type: String, required: true, trim: true }, // Jeepney, Bus, Train, ...
  name: { type: String, trim: true }, // e.g. "Angono - Cubao", "LRT-2"
  price: { type: Number, min: 0, default: 0 },
  // Optional #RRGGBB for this card's line on the map. Empty = use the route's color.
  color: { type: String, default: '', match: /^(#[0-9a-fA-F]{6})?$/ },
  updatedOn: { type: String, required: true }, // YYYY-MM-DD — when the fare/info was last checked
  from: { type: placeSchema, required: true },
  to: { type: placeSchema, required: true },
});

const routeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  cards: [cardSchema],
});

const mapDestinationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    from: { type: placeSchema, required: true },
    to: { type: placeSchema, required: true },
    routes: [routeSchema],
  },
  { timestamps: true }
);

export default mongoose.model('MapDestination', mapDestinationSchema);
