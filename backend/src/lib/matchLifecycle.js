// Match lifecycle — the state machine from the Live Telecast spec (§1).
//
// The spec names the states DRAFT → SCHEDULED → READY → LIVE → COMPLETED. This
// module implements exactly that, but over the *lowercase* status strings the
// app already stores. `status === 'live'` is compared in ~30 places across the
// scoring screens and `'completed'` in ~13; renaming the stored values to match
// the spec's capitalisation would break every one of them for no behavioural
// gain. The states are the spec's; the spelling is the database's.
//
// Two statuses predate the spec and are kept:
//   'break'    — innings break. A *sub-state of live*: the match is on air, the
//                players are off the field. Broadcast must survive it.
//   'upcoming' — legacy synonym for 'scheduled' in older rows.

export const MATCH_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  READY: 'ready',
  LIVE: 'live',
  BREAK: 'break',
  COMPLETED: 'completed',
};

/** Legacy spellings that mean one of the canonical states above. */
const ALIASES = { upcoming: MATCH_STATUS.SCHEDULED };

export function canonicalStatus(status) {
  const s = String(status || '').toLowerCase();
  return ALIASES[s] || s;
}

/**
 * Legal forward transitions. Deliberately narrow: a match may be pulled back
 * from READY to SCHEDULED (the organiser un-readies it), but nothing returns
 * from COMPLETED — a finished match with an archived video is a historical
 * record, and re-opening it would orphan the broadcast archive.
 */
const TRANSITIONS = {
  [MATCH_STATUS.DRAFT]: [MATCH_STATUS.SCHEDULED],
  [MATCH_STATUS.SCHEDULED]: [MATCH_STATUS.READY, MATCH_STATUS.DRAFT],
  [MATCH_STATUS.READY]: [MATCH_STATUS.LIVE, MATCH_STATUS.SCHEDULED],
  [MATCH_STATUS.LIVE]: [MATCH_STATUS.BREAK, MATCH_STATUS.COMPLETED],
  [MATCH_STATUS.BREAK]: [MATCH_STATUS.LIVE, MATCH_STATUS.COMPLETED],
  [MATCH_STATUS.COMPLETED]: [],
};

export function canTransition(from, to) {
  const f = canonicalStatus(from);
  const t = canonicalStatus(to);
  if (f === t) return true; // idempotent re-assert
  return (TRANSITIONS[f] || []).includes(t);
}

/**
 * A match is "on air eligible" while it is LIVE or at a BREAK.
 *
 * The spec (§15 check 7) says READY *or* LIVE, and that is right for *setting
 * up* a broadcast — you pair the camera before the first ball. It is not right
 * for keeping one alive. Both predicates exist separately below so a caller
 * has to say which one it means.
 */
export function isBroadcastable(status) {
  const s = canonicalStatus(status);
  return s === MATCH_STATUS.LIVE || s === MATCH_STATUS.BREAK;
}

/** May a broadcast be *paired and prepared* for a match in this state? */
export function isPairable(status) {
  const s = canonicalStatus(status);
  return s === MATCH_STATUS.READY || isBroadcastable(s);
}
