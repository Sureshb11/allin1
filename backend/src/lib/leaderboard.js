// leaderboard.js — tournament-wide batting/bowling aggregates ("Orange Cap",
// "Purple Cap", MVP), built from the ball-by-ball data of every real match a
// fixture was played through (TournamentMatch.matchId).
//
// The per-ball rules mirror the live scorecard exactly (see routes/matches.js):
//   • Runs off the bat count on a normal ball or a no-ball; wides/byes/leg-byes
//     don't credit the batter.
//   • Balls faced = every delivery except wides/penalty.
//   • Runs charged to the bowler = bat runs + wides + no-ball extras (byes/leg-
//     byes/penalty are not charged).
//   • A wicket credits the bowler unless it's a run-out (or retired).

import { prisma } from './prisma.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
const oversStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

export async function tournamentLeaderboard(tournamentId) {
  const fixtures = await prisma.tournamentMatch.findMany({
    where: { tournamentId, matchId: { not: null } },
    select: { matchId: true },
  });
  const matchIds = [...new Set(fixtures.map((f) => f.matchId))];
  if (!matchIds.length) return { batsmen: [], bowlers: [], mvp: [] };

  const innings = await prisma.inning.findMany({
    where: { matchId: { in: matchIds } },
    include: { oversData: { include: { balls: true } } },
  });

  const bat = {};   // playerId → { runs, balls, fours, sixes, outs }
  const bowl = {};  // playerId → { balls, runs, wickets }
  const perMatchRuns = {}; // `${playerId}:${matchId}` → runs (for highest score)

  for (const inn of innings) {
    for (const ov of inn.oversData) {
      const bId = ov.bowlerId;
      if (bId) (bowl[bId] ||= { balls: 0, runs: 0, wickets: 0 });
      for (const b of ov.balls) {
        const et = b.extraType;
        if (b.batterId) {
          const bf = (bat[b.batterId] ||= { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0 });
          if (et !== 'wide' && et !== 'penalty' && et !== 'retired') bf.balls += 1;
          if (!et || et === 'noBall') {
            bf.runs += b.runs;
            if (b.runs === 4) bf.fours += 1;
            if (b.runs === 6) bf.sixes += 1;
            const k = `${b.batterId}:${inn.matchId}`;
            perMatchRuns[k] = (perMatchRuns[k] || 0) + b.runs;
          }
        }
        let charged = 0, legal = false;
        if (et === 'wide') charged = b.extras;
        else if (et === 'noBall') charged = b.runs + b.extras;
        else if (et === 'bye' || et === 'legBye') legal = true;
        else if (et === 'penalty' || et === 'retired') charged = 0;
        else { charged = b.runs; legal = true; }
        if (bId) {
          bowl[bId].runs += charged;
          if (legal) bowl[bId].balls += 1;
          if (b.isWicket) {
            const wt = norm(b.wicketType);
            if (wt !== 'runout' && wt !== 'retired') bowl[bId].wickets += 1;
          }
        }
        if (b.isWicket && b.dismissedPlayerId) {
          (bat[b.dismissedPlayerId] ||= { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0 }).outs += 1;
        }
      }
    }
  }

  // highest score per batsman across matches
  const hs = {};
  for (const [k, runs] of Object.entries(perMatchRuns)) {
    const pid = k.split(':')[0];
    if (runs > (hs[pid] || 0)) hs[pid] = runs;
  }

  // player names + teams for everyone involved
  const ids = [...new Set([...Object.keys(bat), ...Object.keys(bowl)])];
  const players = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, team: { select: { name: true } } },
  });
  const info = Object.fromEntries(players.map((p) => [p.id, { name: p.name, team: p.team?.name || null }]));

  const batsmen = Object.entries(bat)
    .map(([id, s]) => ({
      playerId: id, name: info[id]?.name || 'Unknown', team: info[id]?.team,
      runs: s.runs, balls: s.balls, fours: s.fours, sixes: s.sixes,
      highest: hs[id] || 0,
      strikeRate: s.balls ? +(s.runs / s.balls * 100).toFixed(1) : 0,
    }))
    .filter((r) => r.balls > 0)
    .sort((a, b) => b.runs - a.runs || b.strikeRate - a.strikeRate)
    .slice(0, 20);

  const bowlers = Object.entries(bowl)
    .map(([id, s]) => ({
      playerId: id, name: info[id]?.name || 'Unknown', team: info[id]?.team,
      wickets: s.wickets, runs: s.runs, balls: s.balls, overs: oversStr(s.balls),
      economy: s.balls ? +(s.runs / (s.balls / 6)).toFixed(2) : 0,
    }))
    .filter((r) => r.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.economy - b.economy)
    .slice(0, 20);

  // MVP: simple fantasy-style points — runs + boundaries + 20/wicket.
  const points = {};
  for (const [id, s] of Object.entries(bat)) points[id] = (points[id] || 0) + s.runs + s.fours + s.sixes * 2;
  for (const [id, s] of Object.entries(bowl)) points[id] = (points[id] || 0) + s.wickets * 20;
  const mvp = Object.entries(points)
    .map(([id, pts]) => ({
      playerId: id, name: info[id]?.name || 'Unknown', team: info[id]?.team, points: pts,
      runs: bat[id]?.runs || 0, wickets: bowl[id]?.wickets || 0,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  return { batsmen, bowlers, mvp };
}
