// notify.js — in-app notifications for tournament participants.
//
// Resolves a tournament's teams down to the user accounts behind them (each
// team's owner + any roster players linked to a user) and writes Notification
// rows — the same in-app system the bell icon / NotificationScreen already read.
// No push infrastructure; these surface next time the app fetches /notifications.
//
// All helpers are best-effort: notifying is a side effect and must never break
// the primary action, so callers wrap these in a .catch (see safeNotify).

import { prisma } from './prisma.js';

// The set of user IDs to notify for a set of teams: each team's owner plus any
// roster players linked to a user account (deduplicated, nulls dropped).
export async function audienceForTeams(teamIds) {
  const ids = [...new Set((teamIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const teams = await prisma.team.findMany({
    where: { id: { in: ids } },
    select: { ownerId: true, players: { select: { userId: true } } },
  });
  const users = new Set();
  for (const t of teams) {
    if (t.ownerId) users.add(t.ownerId);
    for (const p of t.players) if (p.userId) users.add(p.userId);
  }
  return [...users];
}

// Create one in-app notification per user. Safe no-op on empty audience.
// `data` is an optional deep-link payload (e.g. { tournamentId }) the app uses
// to open the right screen when the notification is tapped.
export async function notifyUsers(userIds, { title, message, type = 'tournament', data }) {
  const uniq = [...new Set((userIds || []).filter(Boolean))];
  if (!uniq.length) return 0;
  await prisma.notification.createMany({
    data: uniq.map((userId) => ({ userId, type, title, message, ...(data ? { data } : {}) })),
  });
  return uniq.length;
}

// Notify the members of the given teams.
export async function notifyTeams(teamIds, payload) {
  return notifyUsers(await audienceForTeams(teamIds), payload);
}

// Notify every participating team's members in a tournament.
export async function notifyAllParticipants(tournamentId, payload) {
  const entries = await prisma.tournamentTeam.findMany({
    where: { tournamentId }, select: { teamId: true },
  });
  return notifyTeams(entries.map((e) => e.teamId), payload);
}

// Wrap a notify call so a failure is logged but never bubbles to the request.
export async function safeNotify(fn) {
  try { return await fn(); }
  catch (e) { console.error('[notify] failed:', e.message); return 0; }
}
