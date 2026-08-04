// awards.js — the honours ledger.
//
// computeAwards() (lib/mvp.js) has always worked out Man of the Match, Fighter
// and the best batter / bowler / fielder from the ball-by-ball data, but only
// ever for the post-match popup: nothing wrote them down. So the MatchMVP table
// stayed empty, `momCount` on every profile counted rows that were never
// created, and a player's career had no honours in it at all.
//
// This module writes them down:
//   persistMatchAwards()  — on completion, one row per squad player: their MVP
//                           points, and the award for the five who won one.
//   seriesAwards()        — folds those rows up over a tournament: Player of the
//                           Series plus the best batter / bowler / fielder of it.
//   careerAwards()        — what a player has won, for the profile cabinet.
//
// Storing every squad player's points (not just the winners') is what makes the
// series awards cheap — a sum over rows already written, rather than a re-read
// of every ball bowled in the tournament.
//
// Matches that finished before any of this existed have no ledger, so their
// honours are missing until someone opens the scorecard (routes/matches.js
// backfills on that read). A career and a series honours board therefore fill in
// as old matches are looked at, rather than needing a one-off backfill script —
// and re-reading every ball of every past match is exactly what this design
// exists to avoid doing on a stats request.

import { prisma } from './prisma.js';
import { computeAwards } from './mvp.js';

// award key on MatchMVP → the field computeAwards() returns it under.
const MATCH_AWARDS = [
  ['motm',    'manOfMatch'],
  ['fighter', 'fighter'],
  ['batter',  'bestBatter'],
  ['bowler',  'bestBowler'],
  ['fielder', 'bestFielder'],
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Write a completed match's awards + MVP points. Idempotent: re-running replaces
 * the match's rows, so a corrected scorecard yields corrected honours.
 *
 * `match` must come from the full award include (routes/matches.js →
 * loadMatchForAwards); pass `awards` if the caller already computed them.
 * Returns the number of rows written.
 */
export async function persistMatchAwards(match, awards) {
  if (!match?.id) return 0;
  const a = awards || computeAwards(match);

  const rows = (a.mvp || [])
    .filter((p) => p?.playerId && p.teamId)
    .map((p) => ({
      matchId:    match.id,
      playerId:   p.playerId,
      teamId:     p.teamId,
      playerName: p.name || null,
      points:     round2(p.total),
      bat:        round2(p.bat),
      bowl:       round2(p.bowl),
      field:      round2(p.field),
    }));
  // A match with no ball-by-ball data (a non-cricket fixture, or a result an
  // organiser typed in) has no honours to file, and filing a squad of zeros
  // would count it as an appearance in every series total.
  if (!rows.some((r) => r.points > 0)) return 0;

  const won = [];
  for (const [kind, field] of MATCH_AWARDS) {
    const w = a[field];
    // An off-squad fielder has no Player row (computeAwards keys them by name),
    // so there is no career to credit — they keep the award in the popup, but
    // it can't be filed here.
    if (!w?.playerId) continue;
    won.push({
      matchId: match.id, kind, playerId: w.playerId,
      playerName: w.name || null, teamId: w.teamId || null, points: round2(w.total),
    });
  }

  // Delete-then-insert in one transaction: cheaper than upserting each row, and
  // it also clears an award that a rescore has moved to someone else.
  await prisma.$transaction([
    prisma.matchMVP.deleteMany({ where: { matchId: match.id } }),
    prisma.matchMVP.createMany({ data: rows, skipDuplicates: true }),
    prisma.matchAward.deleteMany({ where: { matchId: match.id } }),
    prisma.matchAward.createMany({ data: won, skipDuplicates: true }),
  ]);
  return won.length;
}

/** Has this match's ledger been written yet? (Cheap guard for the lazy path.) */
export const hasMatchAwards = async (matchId) =>
  (await prisma.matchAward.count({ where: { matchId } })) > 0;

// ── Series honours ───────────────────────────────────────────────────────────

const SERIES_AWARDS = [
  { kind: 'series',  label: 'Player of the Series', pick: (p) => p.points },
  { kind: 'batter',  label: 'Best Batter',          pick: (p) => p.bat },
  { kind: 'bowler',  label: 'Best Bowler',          pick: (p) => p.bowl },
  { kind: 'fielder', label: 'Best Fielder',         pick: (p) => p.field },
];

/**
 * Fold a tournament's match ledger into its honours. Decided on the same MVP
 * points as the match awards, so "Player of the Series" means the same thing as
 * "Man of the Match", counted over more cricket.
 *
 * Read-only — see persistSeriesAwards() for the write. Returns [] when the
 * tournament has no scored fixtures yet.
 */
export async function seriesAwards(tournamentId) {
  const fixtures = await prisma.tournamentMatch.findMany({
    where: { tournamentId, matchId: { not: null } },
    select: { matchId: true },
  });
  const matchIds = [...new Set(fixtures.map((f) => f.matchId))];
  if (!matchIds.length) return [];

  const [rows, motmRows] = await Promise.all([
    prisma.matchMVP.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchAward.findMany({ where: { matchId: { in: matchIds }, kind: 'motm' }, select: { playerId: true } }),
  ]);
  if (!rows.length) return [];

  const by = {};
  for (const r of rows) {
    const p = (by[r.playerId] ||= {
      playerId: r.playerId, name: r.playerName, teamId: r.teamId,
      points: 0, bat: 0, bowl: 0, field: 0, motm: 0, matches: 0,
    });
    p.points += r.points; p.bat += r.bat; p.bowl += r.bowl; p.field += r.field;
    p.matches += 1;
    if (!p.name && r.playerName) p.name = r.playerName;
  }
  for (const m of motmRows) if (by[m.playerId]) by[m.playerId].motm += 1;
  const players = Object.values(by);

  // Team names for whoever ends up on the honours board.
  const teamIds = [...new Set(players.map((p) => p.teamId).filter(Boolean))];
  const teams = teamIds.length
    ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  const out = [];
  for (const a of SERIES_AWARDS) {
    // A zero score is not an achievement: a tournament where nobody bowled has
    // no best bowler, and crowning the first name in the list would say it did.
    const best = players.filter((p) => a.pick(p) > 0).sort((x, y) => a.pick(y) - a.pick(x))[0];
    if (!best) continue;
    out.push({
      kind: a.kind, label: a.label,
      playerId: best.playerId, playerName: best.name || 'Unknown',
      teamName: teamName[best.teamId] || null,
      points: round2(a.pick(best)),
      detail: `${best.matches} ${best.matches === 1 ? 'match' : 'matches'}`
        + (a.kind === 'series' && best.motm ? ` · ${best.motm} MOM` : ''),
      motm: best.motm,
    });
  }
  return out;
}

/** Compute + store a tournament's honours. Idempotent; safe to re-run. */
export async function persistSeriesAwards(tournamentId) {
  const awards = await seriesAwards(tournamentId);
  if (!awards.length) return 0;
  await prisma.$transaction([
    prisma.tournamentAward.deleteMany({ where: { tournamentId } }),
    prisma.tournamentAward.createMany({
      data: awards.map((a) => ({
        tournamentId, kind: a.kind, playerId: a.playerId,
        playerName: a.playerName, teamName: a.teamName,
        points: a.points, detail: a.detail,
      })),
      skipDuplicates: true,
    }),
  ]);
  return awards.length;
}

// ── Career cabinet ───────────────────────────────────────────────────────────

/**
 * What one player has won, as counts: the five match awards, and the four series
 * ones prefixed so a Best Batter of a series never gets added to the per-match
 * tally. Everything is zero for a player who has won nothing — the profile
 * decides what to hide.
 */
export async function careerAwards(playerId) {
  // One person can hold several Player rows — one per club — so an id or a
  // list of them are both valid here. A career spans the lot; a team screen
  // passes the single row for that club.
  if (Array.isArray(playerId)) {
    const ids = playerId.filter(Boolean);
    if (!ids.length) return careerAwards(null);
    const parts = await Promise.all(ids.map((id) => careerAwards(id)));
    return parts.reduce((acc, p) => {
      for (const k of Object.keys(acc)) acc[k] += p[k];
      return acc;
    }, { motm: 0, fighter: 0, batter: 0, bowler: 0, fielder: 0,
         series: 0, seriesBatter: 0, seriesBowler: 0, seriesFielder: 0, total: 0 });
  }
  const empty = {
    motm: 0, fighter: 0, batter: 0, bowler: 0, fielder: 0,
    series: 0, seriesBatter: 0, seriesBowler: 0, seriesFielder: 0, total: 0,
  };
  if (!playerId) return empty;

  const [match, series] = await Promise.all([
    prisma.matchAward.findMany({ where: { playerId }, select: { kind: true } }),
    prisma.tournamentAward.findMany({ where: { playerId }, select: { kind: true } }),
  ]);

  const out = { ...empty };
  for (const r of match) if (r.kind in out) out[r.kind] += 1;
  const SERIES_KEY = { series: 'series', batter: 'seriesBatter', bowler: 'seriesBowler', fielder: 'seriesFielder' };
  for (const r of series) {
    const k = SERIES_KEY[r.kind];
    if (k) out[k] += 1;
  }
  out.total = Object.entries(out).reduce((t, [k, v]) => (k === 'total' ? t : t + v), 0);
  return out;
}
