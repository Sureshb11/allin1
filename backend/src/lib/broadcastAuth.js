// Broadcast authorization (spec §15, §16, §17, §23).
//
// The architectural rule this file exists to enforce:
//
//   match id      identifies a match          — never authorizes anything
//   JWT           identifies the user         — `authMiddleware` established it
//   UserRole      what they may do app-wide   — e.g. "is a broadcaster at all"
//   MatchRole     what they may do *here*     — organizer/scorer/broadcaster
//   session token authorizes one connection   — short-lived, single-use
//
// Every guard below takes an already-authenticated `req.user`. Nothing here
// accepts a match id as evidence of anything.

import { prisma } from './prisma.js';
import { isAdmin } from './adminAuth.js';
import { canonicalStatus, isPairable, isBroadcastable } from './matchLifecycle.js';

export const ROLE = {
  ORGANIZER: 'ORGANIZER',
  SCORER: 'SCORER',
  BROADCASTER: 'BROADCASTER',
};

export const BROADCAST_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CONNECTED: 'CONNECTED',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
};

/** Statuses that occupy the match's single primary-broadcast slot (spec §6). */
export const ACTIVE_BROADCAST_STATUSES = [
  BROADCAST_STATUS.PENDING,
  BROADCAST_STATUS.APPROVED,
  BROADCAST_STATUS.CONNECTED,
  BROADCAST_STATUS.LIVE,
  BROADCAST_STATUS.PAUSED,
];

/** Terminal statuses — a session here can never become live again. */
export const TERMINAL_BROADCAST_STATUSES = [
  BROADCAST_STATUS.ENDED,
  BROADCAST_STATUS.REVOKED,
  BROADCAST_STATUS.EXPIRED,
  BROADCAST_STATUS.REJECTED,
  BROADCAST_STATUS.FAILED,
];

/**
 * Does this user hold an app-wide capability (spec §17's "broadcaster
 * permission")? Admins implicitly hold all of them.
 */
export async function hasCapability(userId, role) {
  if (!userId) return false;
  if (isAdmin(userId)) return true;
  const row = await prisma.userRole.findUnique({
    where: { userId_role: { userId, role } },
    select: { status: true },
  });
  return row?.status === 'ACTIVE';
}

/**
 * Every role this user holds on this match, as a Set.
 *
 * `Match.scorerId` is folded in because it is what the existing scoring screens
 * actually write when a scorer is assigned or handed over. Treating it as an
 * implicit SCORER role means the telecast system authorizes the person who is
 * genuinely scoring, rather than a parallel table that can silently disagree
 * with the app. Likewise `Match.createdBy` implies ORGANIZER.
 */
export async function matchRolesFor(userId, matchId) {
  const roles = new Set();
  if (!userId || !matchId) return roles;

  const [match, rows] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId }, select: { scorerId: true, createdBy: true } }),
    prisma.matchRole.findMany({ where: { matchId, userId, status: 'ACTIVE' }, select: { role: true } }),
  ]);

  if (match?.scorerId === userId) roles.add(ROLE.SCORER);
  if (match?.createdBy === userId) roles.add(ROLE.ORGANIZER);
  for (const r of rows) roles.add(r.role);
  return roles;
}

/**
 * May this user start/stop/approve broadcasts for this match? The scorer and
 * the organizer both may (spec §2); an admin always may (§2, §18).
 */
export async function canControlBroadcast(userId, matchId) {
  if (isAdmin(userId)) return true;
  const roles = await matchRolesFor(userId, matchId);
  return roles.has(ROLE.SCORER) || roles.has(ROLE.ORGANIZER);
}

/**
 * Express guard: 403 unless the caller controls this match's broadcast.
 * Loads the match once and hands it to the handler as `req.match` so the
 * handler doesn't refetch it.
 */
export function requireBroadcastControl(req, res, next) {
  const matchId = req.params.matchId || req.params.id;
  prisma.match
    .findUnique({ where: { id: matchId } })
    .then(async (match) => {
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (!(await canControlBroadcast(req.user?.sub, matchId))) {
        return res.status(403).json({ error: 'Not authorized to manage this match’s broadcast' });
      }
      req.match = match;
      next();
    })
    .catch(next);
}

/**
 * The spec's §15 checklist, as one function, in order. Returns `null` when the
 * session may proceed, or `{ status, error }` describing the first failure.
 *
 * `intent` distinguishes the two moments this is asked:
 *   'pair'  — setting a broadcast up (match may be READY or LIVE)
 *   'live'  — pushing video right now (match must actually be on air)
 */
export function assertSessionUsable(session, match, { intent = 'live' } = {}) {
  // 6. Match exists?
  if (!match) return { status: 404, error: 'Match not found' };
  if (!session) return { status: 404, error: 'Broadcast session not found' };

  // 4. Broadcast session valid / 8. not revoked?
  if (TERMINAL_BROADCAST_STATUSES.includes(session.status)) {
    return { status: 409, error: `Broadcast session is ${session.status}` };
  }

  // 7. Match is in a state that permits this?
  const ok = intent === 'pair' ? isPairable(match.status) : isBroadcastable(match.status);
  if (!ok) {
    return {
      status: 409,
      error:
        intent === 'pair'
          ? `Match must be ready or live to set up a broadcast (is ${canonicalStatus(match.status)})`
          : `Match is not live (is ${canonicalStatus(match.status)})`,
    };
  }

  return null;
}

/**
 * The single-active-broadcast invariant (spec §6). Enforced here rather than by
 * a database constraint because "active" is a predicate over a set of statuses;
 * expressing it in Postgres needs a partial unique index that Prisma will not
 * model, and splitting the rule across both would let them drift.
 *
 * Not race-free on its own — two simultaneous creates can both pass. Callers
 * run it inside the same transaction as the insert, which is what actually
 * makes it hold.
 */
export async function findActiveSession(matchId, tx = prisma) {
  return tx.broadcastSession.findFirst({
    where: { matchId, status: { in: ACTIVE_BROADCAST_STATUSES } },
    orderBy: { createdAt: 'desc' },
  });
}
