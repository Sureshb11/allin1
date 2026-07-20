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
import { pushToUsers, pushDataToUsers } from './push.js';

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
  // Mirror it to the device as a real push. Best-effort and non-blocking for
  // correctness: a push failure must never undo the in-app notification.
  await pushToUsers(uniq, { title, message, data: { type, ...(data || {}) } })
    .catch((e) => console.error('[notify] push failed:', e.message));

  // Self-maintaining retention: there's no scheduler here, so prune on roughly
  // 1 in 200 writes. Fire-and-forget — it must never delay or fail a notify.
  if (Math.random() < 0.005) {
    trimOldNotifications().catch((e) => console.error('[notify] trim failed:', e.message));
  }
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

// ── Live match updates ───────────────────────────────────────────────────────
// The app used to poll a live scorecard every 6s per watcher. The API runs on
// Vercel serverless, which can't hold a WebSocket or SSE connection, so the
// realtime transport here is a DATA-ONLY push: "match X changed, refetch".
// No tray notification, no new infrastructure — it reuses FCM.
//
// Balls land faster than anyone can read, so pings are coalesced per match:
// at most one every LIVE_PING_MS. A watcher therefore sees roughly the same
// cadence as the old poll, but pays nothing while nothing is happening and
// gets the update almost immediately when it is.
const LIVE_PING_MS = 5000;
const lastPing = new Map();   // matchId -> timestamp

// Takes a match ID: the throttle is checked BEFORE any lookup, so a burst of
// deliveries costs one Map read rather than a query each.
export async function pingMatchWatchers(matchId) {
  if (!matchId) return 0;
  const now = Date.now();
  const prev = lastPing.get(matchId) || 0;
  if (now - prev < LIVE_PING_MS) return 0;      // coalesce a burst of deliveries
  lastPing.set(matchId, now);

  // Keep the map from growing across a long-lived process.
  if (lastPing.size > 500) {
    for (const [k, t] of lastPing) if (now - t > 60_000) lastPing.delete(k);
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId }, select: { team1Id: true, team2Id: true },
  });
  if (!match) return 0;

  const audience = await matchAudience([match.team1Id, match.team2Id]);
  if (!audience.length) return 0;
  // Silent: data only, so it refreshes the screen instead of buzzing the phone.
  return pushDataToUsers(audience, { type: 'score', matchId });
}

// ── Retention ────────────────────────────────────────────────────────────────
// Notifications are fanned out on WRITE (one row per recipient), so a single
// match event on a team with a large following writes a lot of rows. Nobody
// scrolls months back through a bell screen, so old read rows are dead weight:
// bound the table instead of letting it grow forever.
const RETAIN_DAYS = 60;

export async function trimOldNotifications(days = RETAIN_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Only prune what the user has already seen — an old unread notification is
  // still something they haven't been told.
  const { count } = await prisma.notification.deleteMany({
    where: { read: true, createdAt: { lt: cutoff } },
  });
  if (count) console.log(`[notify] trimmed ${count} notification(s) older than ${days}d`);
  return count;
}

// ── "From Your Circle" match + award notifications ───────────────────────────
// A user's circle is the same scope the /matches/circle feed uses: teams they
// own or play for, plus teams they follow. These helpers push the two moments
// people actually care about — a circle team going live, and the result +
// awards once it finishes.

// Users following any of these teams.
export async function followersOfTeams(teamIds) {
  const ids = [...new Set((teamIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await prisma.teamFollow.findMany({
    where: { teamId: { in: ids } }, select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId).filter(Boolean))];
}

// Everyone who should hear about a team's match: its members and its followers.
export async function matchAudience(teamIds) {
  const [members, followers] = await Promise.all([
    audienceForTeams(teamIds), followersOfTeams(teamIds),
  ]);
  return [...new Set([...members, ...followers])];
}

const vs = (m) => `${m.team1?.name || 'Team 1'} vs ${m.team2?.name || 'Team 2'}`;

// A circle team's match just went live. `match` must include team1/team2.
export async function notifyMatchLive(match, { exclude = [] } = {}) {
  const audience = (await matchAudience([match.team1Id, match.team2Id]))
    .filter((u) => !exclude.includes(u));
  return notifyUsers(audience, {
    type: 'match',
    title: 'Match started',
    message: `${vs(match)} is live now.`,
    data: { matchId: match.id },
  });
}

// A circle team's match finished — result to everyone, awards to the winners.
// Award winners get a personal "you won X" card; the rest get the round-up.
export async function notifyMatchResult(match, awards) {
  const audience = await matchAudience([match.team1Id, match.team2Id]);

  // Map each award to the user account behind the winning player.
  const named = [
    ['Man of the Match', awards?.manOfMatch],
    ['Fighter of the Match', awards?.fighter],
    ['Best Batter', awards?.bestBatter],
    ['Best Bowler', awards?.bestBowler],
    ['Best Fielder', awards?.bestFielder],
  ].filter(([, a]) => a?.playerId);

  const players = named.length
    ? await prisma.player.findMany({
        where: { id: { in: named.map(([, a]) => a.playerId) } },
        select: { id: true, userId: true },
      })
    : [];
  const userOf = Object.fromEntries(players.map((p) => [p.id, p.userId]));

  // Personal award cards — one per award the user actually won.
  const awarded = new Set();
  for (const [label, a] of named) {
    const uid = userOf[a.playerId];
    if (!uid) continue;               // guest player, no account to notify
    awarded.add(uid);
    await notifyUsers([uid], {
      type: 'achievement',
      title: `🏆 ${label}`,
      message: `You won ${label} in ${vs(match)}.`,
      data: { matchId: match.id, award: label },
    });
  }

  // Result round-up for everyone else in the circle.
  const motm = awards?.manOfMatch?.name;
  const rest = audience.filter((u) => !awarded.has(u));
  await notifyUsers(rest, {
    type: 'match',
    title: 'Match finished',
    message: [match.result || vs(match), motm ? `${motm} won Man of the Match.` : null]
      .filter(Boolean).join(' · '),
    data: { matchId: match.id },
  });
  return awarded.size + rest.length;
}
