import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// The modules a person can individually toggle on/off for their circle to
// view — kept here (not derived from the route table) so the client and
// server agree on the same fixed list without importing across the
// client/server boundary.
// MGOctaviano07Oct2026: 'invoices' replaced by 'projecttimeline'.
export const MODULE_KEYS = ['clients', 'money', 'bankbook', 'projecttimeline', 'tasks', 'meetings', 'timesheet', 'calendar', 'filing', 'notes', 'notetags', 'maps', 'poi', 'calorie'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    color: { type: String, default: '#12B3A8' }, // used for avatar / chibi tint
    avatarSeed: { type: String, default: () => Math.random().toString(36).slice(2, 8) },
    role: { type: String, enum: ['owner', 'member'], default: 'owner' },

    // "Circle" = the set of users who can view each other's books from the
    // person-switcher in the topbar. Membership is mutual once accepted.
    // sharedModules lives on the circle entry itself (not on the account
    // as a whole) so sharing is a per-person decision: what THIS member of
    // my circle can see of my book, independent of what anyone else sees.
    // The person's own named circles ("Family", "Work", ...). Each person in
    // `circle` below can sit in one or more of these, with a separate set of
    // shared modules per circle. A circle is just a way to organise and
    // switch between your connections; the connection itself is still mutual.
    circles: [
      {
        name: { type: String, required: true, trim: true },
      },
    ],

    circle: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
        // LEGACY: used only while `migrated` is false (entries saved before
        // named circles existed). After migration the real settings live in
        // `memberships`, one per circle this person is in.
        sharedModules: { type: [String], default: () => [...MODULE_KEYS] },
        migrated: { type: Boolean, default: false },
        memberships: [
          {
            circle: { type: mongoose.Schema.Types.ObjectId },
            sharedModules: { type: [String], default: () => [...MODULE_KEYS] },
          },
        ],
        // Who sent this invite — set the same on both sides of the pair,
        // so each account can tell "I sent this, waiting on them" (no
        // decision needed) apart from "they sent this, waiting on me"
        // (needs Accept/Decline), instead of showing both as a prompt.
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true }
);

// What a circle entry lets that person see = the union of what every circle
// they're in grants. Entries from before named circles existed still use
// their old flat list until they're migrated (see ensureCircles).
export function effectiveModules(entry) {
  if (!entry) return [];
  if (!entry.migrated) return [...(entry.sharedModules || [])];
  const set = new Set();
  for (const m of entry.memberships || []) for (const k of m.sharedModules || []) set.add(k);
  return [...set];
}

// Gives the account a default "Main" circle and moves any pre-existing flat
// connections into it with their old sharing settings, so nothing changes
// for people who never use more than one circle. Returns true if it changed
// the document (caller saves).
export function ensureCircles(user) {
  let changed = false;
  if (!user.circles.length) {
    user.circles.push({ name: 'Main' });
    changed = true;
  }
  const main = user.circles[0];
  for (const entry of user.circle) {
    if (!entry.migrated) {
      entry.memberships = [{ circle: main._id, sharedModules: [...(entry.sharedModules || [])] }];
      entry.migrated = true;
      changed = true;
    }
  }
  return changed;
}

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    color: this.color,
    avatarSeed: this.avatarSeed,
    role: this.role,
  };
};

export default mongoose.model('User', userSchema);