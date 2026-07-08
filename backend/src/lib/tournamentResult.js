// tournamentResult.js — the single pipeline for finalizing a tournament fixture.
//
// Used by both paths that finish a fixture:
//   1. the manual "record result" endpoint (organizer types a score), and
//   2. the automatic report when a real, ball-by-ball-scored match ends.
//
// It marks the fixture completed, recomputes standings, advances the bracket,
// and notifies participants — so both paths behave identically.

import { prisma } from './prisma.js';
import { persistStandings, computeStandings } from './standings.js';
import { resolveBracket } from './bracket.js';
import { notifyTeams, notifyAllParticipants, safeNotify } from './notify.js';

// Apply a finished result to a fixture and run the full downstream pipeline.
// result = { tmId, winnerTeamId?, resultKind, stats }
export async function applyTournamentResult(tournamentId, { tmId, winnerTeamId, resultKind = 'win', stats = {} }) {
  const fixture = await prisma.tournamentMatch.update({
    where: { id: tmId },
    data: {
      status: 'completed',
      winnerTeamId: resultKind === 'win' ? winnerTeamId : null,
      resultKind,
      resultStats: stats,
    },
  });
  const standings = await persistStandings(tournamentId);
  const bracket = await resolveBracket(tournamentId);

  // ── Notify participants (best-effort) ──
  const tourney = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } });
  const tName = tourney?.name || 'the tournament';
  const link = { tournamentId }; // deep-link payload → tapping opens the tournament
  const involved = [fixture.team1Id, fixture.team2Id].filter(Boolean);
  if (involved.length) {
    const teams = await prisma.team.findMany({ where: { id: { in: involved } }, select: { id: true, name: true } });
    const nameOf = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    let message;
    if (resultKind === 'win' && winnerTeamId) {
      const loserId = involved.find((id) => id !== winnerTeamId);
      message = `${nameOf[winnerTeamId] || 'A team'} beat ${nameOf[loserId] || 'their opponent'} in ${tName}.`;
    } else {
      message = `${fixture.round || 'A'} match in ${tName} ended in a ${resultKind}.`;
    }
    safeNotify(() => notifyTeams(involved, { title: `${fixture.round || 'Match'} result`, message, data: link }));
  }
  for (const a of bracket.advanced || []) {
    safeNotify(() => notifyTeams([a.teamId], {
      title: 'You advanced!', message: `Your team has advanced to the ${a.round} in ${tName}.`, data: link,
    }));
  }

  // If that was the last fixture, crown the champion and close the tournament.
  await maybeCompleteTournament(tournamentId, tName).catch((e) => console.error('[tournament complete]', e.message));

  return { standings, resolved: bracket.resolved };
}

// When every fixture is completed, mark the tournament completed, record the
// champion, and announce it. Champion = the Final's winner (or the last knockout
// match's winner, or the league leader for a pure round-robin). Idempotent.
async function maybeCompleteTournament(tournamentId, tName) {
  const fixtures = await prisma.tournamentMatch.findMany({ where: { tournamentId } });
  if (!fixtures.length || !fixtures.every((f) => f.status === 'completed')) return;

  const tourney = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
  if (!tourney || tourney.status === 'completed') return; // already crowned

  let championId = fixtures.find((f) => f.round === 'Final' && f.winnerTeamId)?.winnerTeamId || null;
  if (!championId) {
    const knockouts = fixtures
      .filter((f) => f.round && !f.round.startsWith('Group ') && f.winnerTeamId)
      .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    championId = knockouts[0]?.winnerTeamId
      || (await computeStandings(tournamentId))[0]?.teamId
      || null;
  }

  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'completed', championId } });

  if (championId) {
    const champ = await prisma.team.findUnique({ where: { id: championId }, select: { name: true } });
    safeNotify(() => notifyAllParticipants(tournamentId, {
      title: '🏆 Champions!',
      message: `${champ?.name || 'A team'} won ${tName}!`,
      data: { tournamentId },
    }));
  }
}

// Derive a tournament result from a completed cricket match's innings totals.
// Aggregates each side's runs + overs (a side may bat more than one inning) →
// winner = more aggregate runs (equal = tie), plus the NRR inputs the standings
// engine expects. Returns null if the match has no scorable innings.
export async function deriveResultFromMatch(match) {
  const innings = await prisma.inning.findMany({ where: { matchId: match.id } });
  if (!innings.length) return null;

  const agg = {}; // teamId → { scored, overs }
  for (const inn of innings) {
    const a = (agg[inn.battingTeamId] ||= { scored: 0, overs: 0 });
    a.scored += inn.totalRuns || 0;
    a.overs += inn.totalOvers || 0;
  }
  const t1 = match.team1Id, t2 = match.team2Id;
  const s1 = agg[t1]?.scored || 0, o1 = agg[t1]?.overs || 0;
  const s2 = agg[t2]?.scored || 0, o2 = agg[t2]?.overs || 0;

  const resultKind = s1 === s2 ? 'tie' : 'win';
  const winnerTeamId = s1 === s2 ? null : (s1 > s2 ? t1 : t2);
  const stats = {
    [t1]: { scored: s1, conceded: s2, oversFaced: o1, oversBowled: o2 },
    [t2]: { scored: s2, conceded: s1, oversFaced: o2, oversBowled: o1 },
  };
  return { winnerTeamId, resultKind, stats };
}

// If a just-completed Match is linked to a tournament fixture, finalize that
// fixture automatically. Best-effort and idempotent (skips already-completed
// fixtures). Called from the match-completion path.
export async function reportMatchToTournament(match) {
  const fixture = await prisma.tournamentMatch.findFirst({
    where: { matchId: match.id, status: { not: 'completed' } },
  });
  if (!fixture) return null;
  const derived = await deriveResultFromMatch(match);
  if (!derived) return null;
  return applyTournamentResult(fixture.tournamentId, { tmId: fixture.id, ...derived });
}
