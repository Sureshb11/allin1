// tournamentResult.js — the single pipeline for finalizing a tournament fixture.
//
// Used by both paths that finish a fixture:
//   1. the manual "record result" endpoint (organizer types a score), and
//   2. the automatic report when a real, ball-by-ball-scored match ends.
//
// It marks the fixture completed, recomputes standings, advances the bracket,
// and notifies participants — so both paths behave identically.

import { prisma } from './prisma.js';
import { isLegalDelivery, oversDecimal } from './deliveries.js';
import { persistStandings, computeStandings } from './standings.js';
import { resolveBracket } from './bracket.js';
import { notifyTeams, notifyAllParticipants, safeNotify } from './notify.js';
import { persistSeriesAwards } from './awards.js';

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
    } else if (resultKind === 'noResult') {
      // Was "ended in a noResult" — the enum key, read out loud in a push
      // notification.
      message = `${fixture.round || 'A'} match in ${tName} was abandoned without a result.`;
    } else {
      message = `${fixture.round || 'A'} match in ${tName} ended in a ${resultKind === 'draw' ? 'draw' : 'tie'}.`;
    }
    // Awaited (not fire-and-forget): on serverless the function suspends after
    // the response, so post-response promises may never run.
    await safeNotify(() => notifyTeams(involved, { title: `${fixture.round || 'Match'} result`, message, data: link }));
  }
  for (const a of bracket.advanced || []) {
    await safeNotify(() => notifyTeams([a.teamId], {
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

  // Honours: Player of the Series and the best batter / bowler / fielder across
  // it, from the match awards already filed for every fixture. Best-effort —
  // a tournament is still finished even if nobody can be crowned (a league with
  // no ball-by-ball scoring has no MVP ledger to sum).
  const honours = await persistSeriesAwards(tournamentId).catch((e) => {
    console.error('[series awards]', e.message);
    return 0;
  });
  if (honours) {
    const [pots] = await prisma.tournamentAward.findMany({ where: { tournamentId, kind: 'series' } });
    if (pots) {
      await safeNotify(() => notifyAllParticipants(tournamentId, {
        title: '⭐ Player of the Series',
        message: `${pots.playerName || 'A player'} is Player of the Series in ${tName}.`,
        data: { tournamentId },
      }));
    }
  }

  if (championId) {
    const champ = await prisma.team.findUnique({ where: { id: championId }, select: { name: true } });
    await safeNotify(() => notifyAllParticipants(tournamentId, {
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
  // Overs come from the DELIVERIES, not from Inning.totalOvers.
  //
  // That column is initialised to 0 and nothing ever updates it — it reads 0 on
  // all 52 innings in the database — so every fixture finished through the app
  // recorded runs correctly and overs as zero. On the schedule card that showed
  // as "0/8", and in the standings it made net run rate `scored / 0` → 0 for
  // every team in every tournament, which is a wrong table rather than an ugly
  // one. The truth was always in the Ball rows.
  const innings = await prisma.inning.findMany({
    where: { matchId: match.id },
    select: {
      battingTeamId: true, totalRuns: true,
      oversData: { select: { balls: { select: { extraType: true } } } },
    },
  });
  if (!innings.length) return null;

  const agg = {}; // teamId → { scored, balls }
  for (const inn of innings) {
    const a = (agg[inn.battingTeamId] ||= { scored: 0, balls: 0 });
    a.scored += inn.totalRuns || 0;
    for (const ov of inn.oversData) {
      for (const b of ov.balls) if (isLegalDelivery(b)) a.balls += 1;
    }
  }
  const t1 = match.team1Id, t2 = match.team2Id;
  const s1 = agg[t1]?.scored || 0, b1 = agg[t1]?.balls || 0;
  const s2 = agg[t2]?.scored || 0, b2 = agg[t2]?.balls || 0;

  const resultKind = s1 === s2 ? 'tie' : 'win';
  const winnerTeamId = s1 === s2 ? null : (s1 > s2 ? t1 : t2);
  // Two forms on purpose. oversFaced is a true decimal because the standings
  // engine divides by it; ballsFaced is the exact count so a card can print
  // cricket's own 8.3 without having to guess it back out of 8.5.
  const stats = {
    [t1]: { scored: s1, conceded: s2, oversFaced: oversDecimal(b1), oversBowled: oversDecimal(b2), ballsFaced: b1, ballsBowled: b2 },
    [t2]: { scored: s2, conceded: s1, oversFaced: oversDecimal(b2), oversBowled: oversDecimal(b1), ballsFaced: b2, ballsBowled: b1 },
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
