import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { MODULE_KEYS } from '../models/User.js';
import Settings from '../models/Settings.js';

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30m',
  });
}

export async function register(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const palette = ['#12B3A8', '#F1614B', '#E3A23D', '#5B6EE1', '#9B5DE5'];
  const user = await User.create({
    name,
    email,
    passwordHash,
    color: palette[Math.floor(Math.random() * palette.length)],
  });
  await Settings.create({ owner: user._id });

  const token = signToken(user._id);
  res.status(201).json({ token, user: user.toSafeJSON() });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await user.comparePassword(password || '');
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user._id);
  res.json({ token, user: user.toSafeJSON() });
}

// Called by the client on real activity, to silently extend the session
// without forcing a re-login every 30 minutes of active use. If the person
// goes idle, they simply stop calling this and the old token expires.
export async function refresh(req, res) {
  const token = signToken(req.user._id);
  res.json({ token, user: req.user.toSafeJSON() });
}

export async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

// Updates the account's own display name and/or email (NOT the "Shade"
// color — that has its own endpoint above, and NOT the password — that's
// changePassword below, since it needs the current password re-checked).
export async function updateProfile(req, res) {
  const { name, email } = req.body;
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    updates.name = name.trim();
  }

  if (email !== undefined) {
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (normalized !== req.user.email) {
      const existing = await User.findOne({ email: normalized });
      if (existing) return res.status(409).json({ error: 'That email is already in use' });
      updates.email = normalized;
    }
  }

  Object.assign(req.user, updates);
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}

// Changes the account password. Requires the CURRENT password so someone
// who grabs an unattended, still-logged-in session can't silently lock
// the real owner out by setting a new one.
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are both required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const ok = await req.user.comparePassword(currentPassword);
  // 403, not 401: this is an authenticated request with a valid session —
  // the client treats 401 as "session expired" and logs the person out,
  // which would be wrong here since the token itself is still good.
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  res.json({ ok: true });
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// This is the "Shade" personalization color — it drives the app's accent
// on the person's own screen, and is the same color everyone else sees
// on their avatar chip and chibi.
export async function updateColor(req, res) {
  const { color } = req.body;
  if (!HEX_RE.test(color || '')) return res.status(400).json({ error: 'Color must be a hex value like #12B3A8' });
  req.user.color = color;
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
}

// Sets what ONE specific circle member can see of my book. Scoped to that
// member's own circle entry, so it never touches what anyone else sees.
export async function updateSharedModulesForMember(req, res) {
  const { userId } = req.params;
  // MGOctaviano07Oct2026: circle entries saved before the Invoices module was removed may
  // still carry the retired 'invoices' key — drop it instead of rejecting.
  const sharedModules = Array.isArray(req.body.sharedModules)
    ? req.body.sharedModules.filter((k) => k !== 'invoices')
    : req.body.sharedModules;
  if (!Array.isArray(sharedModules) || !sharedModules.every((k) => MODULE_KEYS.includes(k))) {
    return res.status(400).json({ error: 'sharedModules must be a list of known module keys' });
  }
  const entry = req.user.circle.find((c) => c.status === 'accepted' && String(c.user) === String(userId));
  if (!entry) return res.status(404).json({ error: 'Not an accepted circle member' });
  entry.sharedModules = sharedModules;
  await req.user.save();
  res.json({ ok: true });
}

// --- Circle (personnel management) ---

export async function inviteToCircle(req, res) {
  const { email } = req.body;
  const target = await User.findOne({ email: (email || '').toLowerCase() });
  if (!target) return res.status(404).json({ error: 'No account with that email' });
  if (String(target._id) === String(req.user._id)) {
    return res.status(400).json({ error: "That's your own account" });
  }

  const already = req.user.circle.some((c) => String(c.user) === String(target._id));
  if (!already) {
    req.user.circle.push({ user: target._id, status: 'pending', invitedBy: req.user._id });
    await req.user.save();
  }
  const reciprocal = target.circle.some((c) => String(c.user) === String(req.user._id));
  if (!reciprocal) {
    target.circle.push({ user: req.user._id, status: 'pending', invitedBy: req.user._id });
    await target.save();
  }
  res.status(201).json({ ok: true });
}

export async function respondToInvite(req, res) {
  const { userId, accept } = req.body;
  const entry = req.user.circle.find((c) => String(c.user) === String(userId));
  if (!entry) return res.status(404).json({ error: 'No such invite' });
  if (entry.invitedBy && String(entry.invitedBy) === String(req.user._id)) {
    return res.status(400).json({ error: "You sent this invite — nothing to accept on your side yet" });
  }

  if (accept) {
    entry.status = 'accepted';
    await req.user.save();
    const other = await User.findById(userId);
    const otherEntry = other?.circle.find((c) => String(c.user) === String(req.user._id));
    if (otherEntry) {
      otherEntry.status = 'accepted';
      await other.save();
    }
  } else {
    req.user.circle = req.user.circle.filter((c) => String(c.user) !== String(userId));
    await req.user.save();
  }
  res.json({ ok: true });
}

export async function removeFromCircle(req, res) {
  const { userId } = req.params;
  req.user.circle = req.user.circle.filter((c) => String(c.user) !== String(userId));
  await req.user.save();
  const other = await User.findById(userId);
  if (other) {
    other.circle = other.circle.filter((c) => String(c.user) !== String(req.user._id));
    await other.save();
  }
  res.json({ ok: true });
}

// The list the person-switcher dropdown renders: yourself + everyone whose
// book you're allowed to view (accepted circle members), plus any pending
// invites so the UI can show "awaiting" state. Also returns `sharing` —
// your own outgoing per-person settings, for the Circle page's toggles.
export async function listCircle(req, res) {
  await req.user.populate('circle.user', 'name email color avatarSeed');
  const accepted = req.user.circle.filter((c) => c.status === 'accepted' && c.user);

  // What each accepted member has shared with ME lives on THEIR circle
  // entry pointing back at me, not on mine — $elemMatch pulls just that
  // one subdocument per person in a single query.
  const theirDocs = accepted.length
    ? await User.find(
        { _id: { $in: accepted.map((c) => c.user._id) } },
        { circle: { $elemMatch: { user: req.user._id } } }
      )
    : [];
  const theirSharedWithMe = new Map(theirDocs.map((u) => [String(u._id), u.circle[0]?.sharedModules || []]));

  const viewable = [
    { ...req.user.toSafeJSON(), self: true },
    ...accepted.map((c) => ({
      id: c.user._id,
      name: c.user.name,
      email: c.user.email,
      color: c.user.color,
      avatarSeed: c.user.avatarSeed,
      sharedModules: theirSharedWithMe.get(String(c.user._id)) || [],
    })),
  ];

  // My own outgoing settings — what I've chosen to let each accepted
  // member see of my book.
  const sharing = accepted.map((c) => ({
    id: c.user._id,
    name: c.user.name,
    email: c.user.email,
    sharedModules: c.sharedModules,
  }));

  const pendingEntries = req.user.circle.filter((c) => c.status === 'pending' && c.user);
  // Entries without invitedBy predate this fix — fall back to treating
  // them as incoming so they still surface an Accept/Decline prompt
  // rather than silently disappearing.
  const pending = pendingEntries
    .filter((c) => !c.invitedBy || String(c.invitedBy) !== String(req.user._id))
    .map((c) => ({ id: c.user._id, name: c.user.name, email: c.user.email }));
  const outgoing = pendingEntries
    .filter((c) => c.invitedBy && String(c.invitedBy) === String(req.user._id))
    .map((c) => ({ id: c.user._id, name: c.user.name, email: c.user.email }));

  res.json({ viewable, pending, outgoing, sharing });
}