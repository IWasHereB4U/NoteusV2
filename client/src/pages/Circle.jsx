import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Kept in sync with MODULE_KEYS on the server — there's no shared-package
// boundary between client and server here, so this list is duplicated
// deliberately rather than fetched.
const MODULES = [
  ['clients', 'Clients'],
  ['money', 'Money'],
  ['bankbook', 'Bankbook'],
  ['projecttimeline', 'Project Timeline'], // MGOctaviano07Oct2026: replaced Invoices
  ['tasks', 'Tasks'],
  ['meetings', 'Meetings'],
  ['timesheet', 'Timesheet'],
  ['calendar', 'Calendar'],
  ['filing', 'Filing desk'],
  ['notes', 'Notes'],
  ['notetags', 'Note Tag'],
  ['maps', 'Destination'], // key stays `maps` so existing sharing settings still apply
  ['poi', 'Point of Interest'],
  ['calorie', 'Calorie'],
];

const same = (a, b) => String(a) === String(b);

export function Circle() {
  const {
    circle, loadCircle, updateSharedModulesFor,
    createCircle, renameCircle, deleteCircle, setMemberCircles,
    activeCircleId, selectCircle,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingFor, setSavingFor] = useState(null); // userId currently being saved
  const [tabId, setTabId] = useState(null); // which circle's page is open
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // The open tab: the one picked, else the one the top bar shows, else the first.
  const current =
    circle.circles.find((c) => same(c.id, tabId)) ||
    circle.circles.find((c) => same(c.id, activeCircleId)) ||
    circle.circles[0];

  const members = current ? circle.sharing.filter((p) => p.circleIds.some((id) => same(id, current.id))) : [];
  const others = current ? circle.sharing.filter((p) => !p.circleIds.some((id) => same(id, current.id))) : [];
  const countIn = (c) => circle.sharing.filter((p) => p.circleIds.some((id) => same(id, c.id))).length;

  async function run(fn, userId = null) {
    setError('');
    if (userId) setSavingFor(userId);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      if (userId) setSavingFor(null);
    }
  }

  async function invite(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/circle/invite', { email, circleId: current?.id });
      setEmail('');
      await loadCircle();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCircle(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await run(async () => {
      const created = await createCircle(newName.trim());
      setNewName('');
      setAdding(false);
      setTabId(created.id);
    });
  }

  async function rename() {
    const name = prompt('Rename this circle', current.name);
    if (name === null || !name.trim() || name.trim() === current.name) return;
    await run(() => renameCircle(current.id, name.trim()));
  }

  async function removeCircle() {
    if (!confirm(`Delete the circle "${current.name}"? Nobody is disconnected — anyone who was only in this circle moves to another one with nothing shared.`)) return;
    await run(async () => {
      await deleteCircle(current.id);
      setTabId(null);
    });
  }

  async function respond(userId, accept) {
    await api.post('/auth/circle/respond', { userId, accept });
    await loadCircle();
  }

  async function removeEverywhere(userId) {
    if (!confirm('Remove this person from ALL your circles? They will no longer be able to view your book.')) return;
    await run(async () => {
      await api.del(`/auth/circle/${userId}`);
      await loadCircle();
    });
  }

  // Sharing is per person AND per circle: this edits only their membership
  // in the open circle, not what they get through any other circle.
  async function toggleModule(person, key) {
    const membership = person.memberships.find((m) => same(m.circleId, current.id));
    // MGOctaviano07Oct2026: only send keys the app still knows (drops the retired 'invoices').
    const known = (membership?.sharedModules || []).filter((k) => MODULES.some(([m]) => m === k));
    const next = known.includes(key) ? known.filter((k) => k !== key) : [...known, key];
    await run(() => updateSharedModulesFor(person.id, current.id, next), person.id);
  }

  async function toggleMembership(person, circleId) {
    const has = person.circleIds.some((id) => same(id, circleId));
    const next = has
      ? person.circleIds.filter((id) => !same(id, circleId))
      : [...person.circleIds, circleId];
    await run(() => setMemberCircles(person.id, next), person.id);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Personnel</div>
          <h1>Circle</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink2)', maxWidth: 600, marginTop: -8 }}>
        Keep as many circles as you like — Family, Work, Clients — and switch between them from the
        top bar. Everyone in your circles can switch to view your book (read-only). Invites are
        mutual. For each person, you choose which modules they can see <b>in each circle they're in</b>;
        someone in two circles sees everything either one allows.
      </p>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="circle-tabs">
        {circle.circles.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`circle-tab ${current && same(c.id, current.id) ? 'on' : ''}`}
            onClick={() => setTabId(c.id)}
          >
            {c.name}<span className="n">{countIn(c)}</span>
          </button>
        ))}
        {adding ? (
          <form onSubmit={addCircle} style={{ display: 'flex', gap: 6 }}>
            <input
              className="field sm"
              placeholder="Circle name"
              value={newName}
              maxLength={40}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn sm" disabled={!newName.trim()}>Create</button>
            <button type="button" className="btn ghost sm" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>+ New circle</button>
        )}
      </div>

      {current && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className="btn ghost sm"
              onClick={() => selectCircle(current.id)}
              disabled={same(activeCircleId, current.id)}
              title="Show this circle in the top-bar roster"
            >
              {same(activeCircleId, current.id) ? '✓ Shown in top bar' : 'Show in top bar'}
            </button>
            <button className="btn ghost sm" onClick={rename}>Rename</button>
            <button className="btn danger sm" onClick={removeCircle} disabled={circle.circles.length <= 1}
              title={circle.circles.length <= 1 ? "You can't delete your only circle" : 'Delete this circle'}>
              Delete circle
            </button>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h"><h2>Add someone to “{current.name}”</h2></div>
            <div className="card-b">
              <form onSubmit={invite} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field"
                  type="email"
                  placeholder="Their account email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Invite'}</button>
              </form>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
                Already connected to them? Inviting again just adds them to this circle.
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h"><h2>What each person in “{current.name}” can see</h2></div>
            {members.length === 0 ? (
              <div className="empty"><b>Nobody in this circle yet</b>Invite someone above{others.length ? ', or add a connection from below' : ''}.</div>
            ) : (
              <div className="stack">
                {members.map((p) => {
                  const membership = p.memberships.find((m) => same(m.circleId, current.id));
                  const shared = membership?.sharedModules || [];
                  return (
                    <div key={p.id} style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {savingFor === p.id && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Saving…</span>}
                          {p.circleIds.length > 1 && (
                            <button className="btn ghost sm" onClick={() => toggleMembership(p, current.id)} title="Take them out of this circle only">
                              Remove from this circle
                            </button>
                          )}
                          <button className="btn danger sm" onClick={() => removeEverywhere(p.id)}
                            title="Disconnect completely — removes them from every circle">
                            {p.circleIds.length > 1 ? 'Remove from all' : 'Remove'}
                          </button>
                        </div>
                      </div>

                      {circle.circles.length > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>In circles:</span>
                          {circle.circles.map((c) => {
                            const on = p.circleIds.some((id) => same(id, c.id));
                            const onlyOne = on && p.circleIds.length === 1;
                            return (
                              <label key={c.id} className="circle-chip" title={onlyOne ? 'They must stay in at least one circle' : undefined}
                                style={{ opacity: onlyOne ? 0.6 : 1 }}>
                                <input type="checkbox" checked={on} disabled={onlyOne || savingFor === p.id}
                                  onChange={() => toggleMembership(p, c.id)} />
                                {c.name}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                        {MODULES.map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={shared.includes(key)}
                              disabled={savingFor === p.id}
                              onChange={() => toggleModule(p, key)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {others.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-h"><h2>Connected, but not in “{current.name}”</h2></div>
              <div className="stack">
                {others.map((p) => (
                  <div key={p.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                        {p.email} · in {circle.circles.filter((c) => p.circleIds.some((id) => same(id, c.id))).map((c) => c.name).join(', ')}
                      </div>
                    </div>
                    <button className="btn sm" disabled={savingFor === p.id} onClick={() => toggleMembership(p, current.id)}>
                      Add to {current.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {circle.pending.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h"><h2>Invites waiting on you</h2></div>
          <div className="stack">
            {circle.pending.map((p) => (
              <div key={p.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" onClick={() => respond(p.id, true)}>Accept</button>
                  <button className="btn ghost sm" onClick={() => respond(p.id, false)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '0 18px 12px' }}>
            Accepted people go into your first circle — move them from the circle's page afterwards.
          </div>
        </div>
      )}

      {circle.outgoing.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h"><h2>Invites you've sent</h2></div>
          <div className="stack">
            {circle.outgoing.map((p) => (
              <div key={p.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{p.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="tag ochre">awaiting response</span>
                  <button className="btn ghost sm" onClick={() => removeEverywhere(p.id)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
