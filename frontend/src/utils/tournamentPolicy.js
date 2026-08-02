// Can this tournament take a join request right now?
//
// The create wizard collects a registration policy — invite only, a closing
// date, a maximum, a "teams can request to join" switch. The server enforces it
// (POST /:id/join-requests). This is the same question asked client-side, so a
// button isn't offered for something that will come back 409.
//
// It returns the REASON when the answer is no, because "Request to Join" simply
// vanishing tells an organiser nothing about which of their own settings did it.
export function joinPolicy(t, approvedCount) {
  if (!t) return { open: false, reason: '' };
  if (['completed', 'cancelled'].includes(t.status)) return { open: false, reason: 'This tournament has finished' };
  if (t.flags && t.flags.teamRegistration === false) return { open: false, reason: 'Not taking team registrations' };
  if (t.registration?.type === 'invite') return { open: false, reason: 'Invite only — the organiser adds teams' };
  const closesAt = t.regWindow?.closesAt ? new Date(t.regWindow.closesAt) : null;
  if (closesAt && closesAt < new Date()) {
    return { open: false, reason: `Registration closed ${closesAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` };
  }
  const cap = capacity(t, approvedCount);
  if (cap.full) return { open: false, reason: `Full — ${cap.taken} of ${cap.max} teams` };
  // Started already: entries closed whatever the stored status still says.
  if (effectiveStatus(t) === 'ongoing' && String(t.status).toLowerCase() === 'upcoming') {
    return { open: false, reason: 'Already under way' };
  }
  return { open: true, reason: '' };
}


// How full is it, and is it full?
export function capacity(t, approvedCount) {
  const taken = approvedCount ?? (Array.isArray(t?.teams) ? t.teams.length : (t?.teams || 0));
  const max = t?.maxTeams || 0;
  return { taken, max, full: max > 0 && taken >= max };
}

// What state is this tournament ACTUALLY in?
//
// `status` is a stored string the organiser sets, and it goes stale the moment
// the world moves on without them: edit the start date to yesterday and a
// tournament still reads "upcoming", still says OPEN on its card, still invites
// teams to join something already under way. Same when every place is taken —
// 16 of 16 and still advertising for entries.
//
// So the stored status is the FLOOR, not the answer. A tournament that has
// reached its start date is under way; one that is full is no longer open, even
// if it hasn't started. Nothing is written to the database for this — the
// organiser's declared status is theirs, and they can still move it forward or
// back explicitly. This is only what everyone is shown in the meantime.
export function effectiveStatus(t, approvedCount) {
  const stored = String(t?.status || '').toLowerCase();
  if (stored === 'completed' || stored === 'cancelled') return stored;
  // Full counts as a state. A tournament with every place taken is not "open"
  // in any sense a reader cares about, and saying OPEN over 16 of 16 is the
  // exact complaint this came from. It ranks below started — a full tournament
  // that has begun is under way, not merely full.
  const cap = capacity(t, approvedCount);
  // The list maps tournaments into a smaller shape and renames the date, so
  // accept either. Missing means "no start date", which never counts as started.
  const start = t?.startDate || t?.startsAt;
  const started = start && !Number.isNaN(new Date(start).getTime()) && new Date(start) <= new Date();
  if (stored === 'upcoming' && started) return 'ongoing';
  if (stored === 'upcoming' && cap.full) return 'full';
  return stored || 'upcoming';
}

export default joinPolicy;
