import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// The modules a person can individually toggle on/off for their circle to
// view — kept here (not derived from the route table) so the client and
// server agree on the same fixed list without importing across the
// client/server boundary.
// MGOctaviano07Oct2026: 'invoices' replaced by 'projecttimeline'.
export const MODULE_KEYS = ['clients', 'money', 'projecttimeline', 'tasks', 'meetings', 'timesheet', 'calendar', 'filing', 'notes', 'notetags', 'maps'];

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
    circle: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
        sharedModules: { type: [String], default: () => [...MODULE_KEYS] },
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