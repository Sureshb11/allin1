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
  const taken = approvedCount ?? (Array.isArray(t.teams) ? t.teams.length : 0);
  if (t.maxTeams && taken >= t.maxTeams) return { open: false, reason: `Full — ${taken} of ${t.maxTeams} teams` };
  return { open: true, reason: '' };
}

export default joinPolicy;
