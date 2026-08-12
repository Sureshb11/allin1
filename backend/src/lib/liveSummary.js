// The compact live match state the broadcast overlay renders (spec §7, §19).
//
// The spec asks for a `LiveMatchState` table holding score, wickets, overs,
// batsmen, bowler, run rates. This module computes that same shape instead of
// storing it. That is a deliberate substitution: `Inning`/`Over`/`Ball` are
// already the source of truth that the scorer writes and the scorecard reads,
// and a second stored copy is a second thing that can be wrong — the failure
// mode being an overlay that says 153/4 while the scorecard says 157/4, live,
// on air, with no way to tell which lied.
//
// Derivation is cheap (one indexed query per match) and the read path is edge-
// cached, so the copy buys nothing it costs.

import { prisma } from './prisma.js';
import { isLegalDelivery } from './deliveries.js';

/** Overs as cricket writes them: 18.4 means eighteen overs and four balls. */
function formatOvers(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

/** Overs as a number, for rate arithmetic. 18.4 overs is 18.667 overs of run rate. */
function decimalOvers(legalBalls) {
  return legalBalls / 6;
}

function rate(runs, legalBalls) {
  const o = decimalOvers(legalBalls);
  return o > 0 ? Number((runs / o).toFixed(2)) : 0;
}

/**
 * Build the overlay state for a match. Returns null if the match doesn't exist.
 *
 * Cricket only for now: the other sports' feeds do not have a broadcast overlay
 * yet, and their score already lives denormalised on `Match.score1/score2`, so
 * they get the simple branch.
 */
export async function liveSummary(matchId) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      team1: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      team2: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
  });
  if (!match) return null;

  const base = {
    matchId: match.id,
    sport: match.sport,
    status: match.status,
    venue: match.venue,
    result: match.result,
    teams: { team1: match.team1, team2: match.team2 },
    updatedAt: new Date().toISOString(),
  };

  if (match.sport !== 'cricket') {
    return { ...base, score1: match.score1, score2: match.score2 };
  }

  const innings = await prisma.inning.findMany({
    where: { matchId },
    orderBy: { inningNumber: 'asc' },
    include: {
      battingTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      bowlingTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      oversData: {
        orderBy: { overNumber: 'asc' },
        include: { balls: { orderBy: { ballNumber: 'asc' } } },
      },
    },
  });

  if (innings.length === 0) return { ...base, innings: [], live: null };

  const summarised = innings.map((inn) => {
    const balls = inn.oversData.flatMap((o) => o.balls.map((b) => ({ ...b, overNumber: o.overNumber, overBowlerId: o.bowlerId })));
    const legal = balls.filter(isLegalDelivery).length;
    return {
      inningNumber: inn.inningNumber,
      battingTeam: inn.battingTeam,
      bowlingTeam: inn.bowlingTeam,
      runs: inn.totalRuns,
      wickets: inn.totalWickets,
      legalBalls: legal,
      overs: formatOvers(legal),
      runRate: rate(inn.totalRuns, legal),
      _inn: inn,
      _balls: balls,
    };
  });

  const current = summarised[summarised.length - 1];
  const first = summarised[0];
  const inn = current._inn;
  const balls = current._balls;

  // Target/RRR only exist in the second innings, and only when the maximum
  // overs are known — a match played "to a finish" has no required rate.
  const isChase = current.inningNumber >= 2;
  const target = isChase ? first.runs + 1 : null;
  const maxBalls = match.overs ? match.overs * 6 : null;
  const ballsLeft = maxBalls ? Math.max(0, maxBalls - current.legalBalls) : null;
  const required = isChase && target != null ? Math.max(0, target - current.runs) : null;
  const requiredRunRate =
    isChase && ballsLeft ? Number(((required / ballsLeft) * 6).toFixed(2)) : null;

  // Batter and bowler figures, accumulated over this innings only.
  const creaseIds = [inn.strikerId, inn.nonStrikerId, inn.currentBowlerId].filter(Boolean);
  const players = creaseIds.length
    ? await prisma.player.findMany({ where: { id: { in: creaseIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = (id) => players.find((p) => p.id === id)?.name || null;

  const batterCard = (playerId) => {
    if (!playerId) return null;
    const faced = balls.filter((b) => b.batterId === playerId);
    return {
      id: playerId,
      name: nameOf(playerId),
      // Runs off the bat only — extras belong to the team, not the batter.
      runs: faced.reduce((n, b) => n + b.runs, 0),
      balls: faced.filter(isLegalDelivery).length,
      fours: faced.filter((b) => b.runs === 4).length,
      sixes: faced.filter((b) => b.runs === 6).length,
    };
  };

  const bowlerCard = (playerId) => {
    if (!playerId) return null;
    const bowled = balls.filter((b) => (b.bowlerId || b.overBowlerId) === playerId);
    const legalBowled = bowled.filter(isLegalDelivery).length;
    return {
      id: playerId,
      name: nameOf(playerId),
      overs: formatOvers(legalBowled),
      // Byes and leg-byes are not charged to the bowler.
      runs: bowled.reduce(
        (n, b) => n + b.runs + (['bye', 'legBye'].includes(b.extraType) ? 0 : b.extras),
        0,
      ),
      wickets: bowled.filter((b) => b.isWicket && b.wicketType !== 'runOut').length,
    };
  };

  const shape = (b) => ({
    runs: b.runs,
    extras: b.extras,
    extraType: b.extraType,
    isWicket: b.isWicket,
  });

  const recent = balls.slice(-6).map(shape);

  // The over tracker renders *this over only*, so it has to be the current
  // over's deliveries — not the last six of the innings, which straddle the
  // over boundary and would show the previous bowler's work in this bowler's
  // slot. A completed over reads as empty: the next one hasn't started.
  const latestOver = inn.oversData[inn.oversData.length - 1];
  const overBalls = latestOver ? latestOver.balls.map(shape) : [];
  const legalThisOver = overBalls.filter(isLegalDelivery).length;
  const thisOver = legalThisOver >= 6 ? [] : overBalls;

  return {
    ...base,
    innings: summarised.map(({ _inn, _balls, ...rest }) => rest),
    live: {
      inningNumber: current.inningNumber,
      battingTeam: current.battingTeam,
      bowlingTeam: current.bowlingTeam,
      runs: current.runs,
      wickets: current.wickets,
      overs: current.overs,
      maxOvers: match.overs,
      runRate: current.runRate,
      target,
      required,
      ballsRemaining: ballsLeft,
      requiredRunRate,
      striker: batterCard(inn.strikerId),
      nonStriker: batterCard(inn.nonStrikerId),
      bowler: bowlerCard(inn.currentBowlerId),
      recentBalls: recent,
      thisOver,
      lastBall: recent[recent.length - 1] || null,
    },
  };
}
