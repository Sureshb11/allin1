// playerCareer.js — one player's career, computed once.
//
// This was the body of GET /users/me/stats. It moved here because tapping a
// player in Rankings opens the same board of numbers about somebody else, and
// that screen was reading a SEPARATE implementation of the same cricket maths
// (`GET /players/:id/insights`) which disagreed with this one:
//
//   • oversBowled counted Over ROWS, so a two-ball over was a whole over and
//     economy came out as runs ÷ overs-started;
//   • fours counted any delivery worth 4, so four byes were the batter's
//     boundary and the bowler's;
//   • runs conceded came off the Over aggregate, byes and leg-byes included.
//
// So the same career read differently depending on which screen you opened, and
// there was no way to tell which one was lying. There is now one answer.
//
// Cricket comes from the ball-by-ball tables; every other sport records
// SportEvents instead, and gets a tally by type that the app labels itself.

import { prisma } from './prisma.js';
import { careerAwards } from './awards.js';
import { isBowlerWicket } from './deliveries.js';

const BASE = { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 };

/** The shape returned when there's no player to report on. */
export const emptyCareer = (sport = null) => ({ stats: { ...BASE }, sport, linked: false });

/**
 * Everything the career screens draw, for one Player row (include its `team`).
 * Returns { stats, sport, role, team, linked } — the same envelope both routes
 * hand back, so My Stats and a tapped player render from identical data.
 */
export async function playerCareer(player, alsoIds = []) {
  if (!player) return emptyCareer();

  // A career can span several clubs. One person holds one Player row PER TEAM,
  // so "how has this person played" and "how has this person played for this
  // team" are different questions with different answers — and both are asked:
  //
  //   · a team's squad, its leaderboards and a player tapped from either pass
  //     one row, and get that club's numbers. That is the whole point of the
  //     rows being per-team.
  //   · My Stats passes every row the account owns in the sport, and gets the
  //     career. It used to pass whichever row findFirst returned first, so a
  //     player in two clubs saw one club's figures labelled as their career —
  //     and which club, was arbitrary.
  const ids = [...new Set([player.id, ...alsoIds])].filter(Boolean);

  const s = player.stats || {};
  // Real season match count = matches this player's team has played in their sport.
  // How many matches were there to play in — every club this career covers, so
  // a two-club player is not measured against one of them.
  const teamIds = [...new Set([player.teamId, ...(player.teamIds || [])].filter(Boolean))];
  const seasonMatches = teamIds.length
    ? await prisma.match.count({
        where: { sport: player.sport, OR: teamIds.flatMap((id) => [{ team1Id: id }, { team2Id: id }]) },
      })
    : 0;

  // Fielding: the scorer records the fielder as a NAME on Ball.wicketAssists —
  // the catch picker holds their id and discards it — so this can only be
  // matched back by name. wicketType separates the two: run-outs write to the
  // same column, and counting them as catches would make every fielder a slip.
  const fieldName = (player.name || '').trim();
  const [batBalls, dismissals, bowlBalls, xiMatches, awards, catches, runOuts, fieldBalls] = await Promise.all([
    prisma.ball.findMany({
      where: { batterId: { in: ids } },
      select: { runs: true, extraType: true, over: { select: { inningId: true } } },
    }),
    prisma.ball.count({ where: { dismissedPlayerId: { in: ids } } }),
    prisma.ball.findMany({
      where: { over: { bowlerId: { in: ids } } },
      select: { runs: true, extras: true, extraType: true, isWicket: true, wicketType: true, over: { select: { inningId: true } } },
    }),
    prisma.matchPlayer.count({ where: { playerId: { in: ids } } }),
    // The honours cabinet: Man of the Match, Fighter, Best Batter / Bowler /
    // Fielder, plus the series awards.
    careerAwards(ids),
    prisma.ball.count({ where: { isWicket: true, wicketType: 'caught', wicketAssists: fieldName } }),
    prisma.ball.count({ where: { isWicket: true, wicketType: 'runout', wicketAssists: fieldName } }),
    // Per-innings fielding, for the trend chart.
    prisma.ball.findMany({
      where: { isWicket: true, wicketAssists: fieldName, wicketType: { in: ['caught', 'runout'] } },
      select: { over: { select: { inningId: true } } },
    }),
  ]);

  const computed = {};
  
  // ── Batting ─────────────────────────────────────────────────────────────
  const appRuns = batBalls.reduce((t, b) => t + b.runs, 0);
  const appFaced = batBalls.filter((b) => b.extraType !== 'wide').length;
  const perInning = {};
  for (const b of batBalls) perInning[b.over.inningId] = (perInning[b.over.inningId] || 0) + b.runs;
  const appInnScores = Object.values(perInning);
  
  const appHighestScore = appInnScores.length ? Math.max(0, ...appInnScores) : 0;
  const appCenturies = appInnScores.filter((r) => r >= 100).length;
  const appHalfCenturies = appInnScores.filter((r) => r >= 50 && r < 100).length;
  const appFours = batBalls.filter((b) => b.runs === 4).length;
  const appSixes = batBalls.filter((b) => b.runs === 6).length;
  const appNotOuts = Math.max(0, appInnScores.length - dismissals);
  const appDucks = appInnScores.filter((r) => r === 0).length;
  const appBattingDotBalls = batBalls.filter((b) => b.runs === 0 && b.extraType !== 'wide').length;
  
  // Combine with historical baseline (s)
  const runs = (s.runs || 0) + appRuns;
  let historicalFaced = 0;
  if (s.battingStrikeRate && s.runs) historicalFaced = s.runs / (s.battingStrikeRate / 100);
  const totalFaced = Math.round(historicalFaced) + appFaced;

  let historicalDismissals = 0;
  if (s.battingAverage && s.runs) {
      historicalDismissals = s.runs / s.battingAverage;
  } else if (s.innings !== undefined && s.notOuts !== undefined) {
      historicalDismissals = s.innings - s.notOuts;
  }
  const totalDismissals = Math.round(historicalDismissals) + dismissals;

  computed.runs = runs;
  computed.ballsFaced = totalFaced;
  computed.battingStrikeRate = totalFaced ? +(runs / totalFaced * 100).toFixed(1) : (s.battingStrikeRate || 0);
  computed.strikeRate = computed.battingStrikeRate;
  computed.battingAverage = totalDismissals ? +(runs / totalDismissals).toFixed(1) : runs;
  computed.average = computed.battingAverage;
  computed.highestScore = Math.max(s.highestScore || 0, appHighestScore);
  computed.centuries = (s.centuries || 0) + appCenturies;
  computed.halfCenturies = (s.halfCenturies || 0) + appHalfCenturies;
  computed.fours = (s.fours || 0) + appFours;
  computed.sixes = (s.sixes || 0) + appSixes;
  computed.notOuts = (s.notOuts || 0) + appNotOuts;
  computed.ducks = (s.ducks || 0) + appDucks;
  computed.battingDotBalls = (s.battingDotBalls || 0) + appBattingDotBalls;
  computed.innings = (s.innings || 0) + appInnScores.length;

  // ── Bowling ─────────────────────────────────────────────────────────────
  const chargedRuns = (b) =>
    b.extraType === 'wide' ? b.extras
    : b.extraType === 'noBall' ? b.runs + b.extras
    : (b.extraType && b.extraType !== 'bye' && b.extraType !== 'legBye') ? 0
    : (b.extraType ? 0 : b.runs);
  const isLegal = (b) => !['wide', 'noBall', 'penalty', 'retired', 'deadBall'].includes(b.extraType);
  const offTheBat = (b) => !b.extraType || b.extraType === 'noBall';

  const bowled = bowlBalls.filter((b) => b.extraType !== 'penalty');
  const legal = bowled.filter(isLegal).length;
  const conceded = bowled.reduce((t, b) => t + chargedRuns(b), 0);
  const wickets = bowled.filter(isBowlerWicket).length;
  
  const fig = {};
  for (const b of bowled) {
    const k = b.over.inningId;
    fig[k] = fig[k] || { w: 0, r: 0 };
    fig[k].r += chargedRuns(b);
    if (isBowlerWicket(b)) fig[k].w += 1;
  }
  const best = Object.values(fig).sort((a, b) => b.w - a.w || a.r - b.r)[0];
  const appFiveWickets = Object.values(fig).filter((f) => f.w >= 5).length;
  const appDotBalls = bowled.filter((b) => isLegal(b) && chargedRuns(b) === 0).length;
  const appFoursConceded = bowled.filter((b) => offTheBat(b) && b.runs === 4).length;
  const appSixesConceded = bowled.filter((b) => offTheBat(b) && b.runs === 6).length;
  const appWides = bowlBalls.filter(b => b.extraType === 'wide').length;
  const appNoBalls = bowlBalls.filter(b => b.extraType === 'noBall').length;

  // Combine with historical baseline (s)
  const totalWickets = (s.wickets || 0) + wickets;
  const totalConceded = (s.runsConceded || 0) + conceded;
  
  let historicalBalls = 0;
  if (s.oversBowled !== undefined) {
      const obs = parseFloat(s.oversBowled);
      historicalBalls = Math.floor(obs) * 6 + Math.round((obs - Math.floor(obs)) * 10);
  } else if (s.economy && s.runsConceded) {
      const overs = s.runsConceded / s.economy;
      historicalBalls = Math.round(overs * 6);
  }
  const totalBallsBowled = historicalBalls + legal;

  computed.wickets = totalWickets;
  computed.ballsBowled = totalBallsBowled;
  computed.oversBowled = `${Math.floor(totalBallsBowled / 6)}.${totalBallsBowled % 6}`;
  computed.runsConceded = totalConceded;
  computed.economy = totalBallsBowled ? +(totalConceded / (totalBallsBowled / 6)).toFixed(2) : (s.economy || 0);
  computed.bowlingAverage = totalWickets ? +(totalConceded / totalWickets).toFixed(1) : (s.bowlingAverage || null);
  
  let histBestW = 0, histBestR = 0;
  if (s.bestBowling && typeof s.bestBowling === 'string') {
      const parts = s.bestBowling.split('/');
      if (parts.length === 2) {
          histBestW = parseInt(parts[0], 10) || 0;
          histBestR = parseInt(parts[1], 10) || 0;
      }
  }
  let overallBestW = histBestW;
  let overallBestR = histBestR;
  if (best) {
      if (best.w > overallBestW || (best.w === overallBestW && best.r < overallBestR)) {
          overallBestW = best.w;
          overallBestR = best.r;
      }
  }
  computed.bestBowling = (overallBestW > 0 || overallBestR > 0) ? `${overallBestW}/${overallBestR}` : null;
  
  computed.fiveWickets = (s.fiveWickets || 0) + appFiveWickets;
  computed.dotBalls = (s.dotBalls || 0) + appDotBalls;
  computed.wides = (s.wides || 0) + appWides;
  computed.noBalls = (s.noBalls || 0) + appNoBalls;
  computed.foursConceded = (s.foursConceded || 0) + appFoursConceded;
  computed.sixesConceded = (s.sixesConceded || 0) + appSixesConceded;
  computed.maidens = s.maidens || 0;
  computed.bowlingStrikeRate = totalWickets ? +(totalBallsBowled / totalWickets).toFixed(1) : (s.bowlingStrikeRate || 0);

  computed.matches = (s.matches || 0) + xiMatches;

  // ── Recent form: the player's last 5 completed matches ────────────────────
  // Win/loss comes from Match.result, which is free text ("<Team> won by 42
  // runs") — so we match it against the player's own team name rather than
  // inventing a column. A tie (or an unparseable result) yields result: null,
  // which the client renders neutrally.
  const formRows = await prisma.matchPlayer.findMany({
    where: { playerId: { in: ids }, match: { status: 'completed' } },
    orderBy: { match: { startTime: 'desc' } },
    include: {
      team:  { select: { name: true } },
      match: { select: {
        id: true, result: true, startTime: true,
        team1: { select: { name: true } },
        team2: { select: { name: true } },
      } },
    },
  });

  let recentForm = [];
  if (formRows.length) {
    const formMatchIds = formRows.map((r) => r.matchId);
    const [fBat, fBowl, moms] = await Promise.all([
      prisma.ball.findMany({
        where: { batterId: { in: ids }, over: { inning: { matchId: { in: formMatchIds } } } },
        select: { runs: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      prisma.ball.findMany({
        where: { over: { bowlerId: { in: ids }, inning: { matchId: { in: formMatchIds } } } },
        select: { isWicket: true, wicketType: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      // Awards won in these matches. Reads the award table, not the MVP points
      // ledger — that has a row per squad player per match, so counting it was
      // counting every appearance as a Man of the Match.
      prisma.matchAward.findMany({
        where: { playerId: { in: ids }, matchId: { in: formMatchIds } },
        select: { matchId: true, kind: true },
      }),
    ]);
    const momIds = new Set(moms.filter((m) => m.kind === 'motm').map((m) => m.matchId));
    // The best thing taken home from each match: a top-scoring all-rounder often
    // wins three in one game, and the badge should say Man of the Match rather
    // than whichever row came back first.
    const AWARD_RANK = ['motm', 'fighter', 'batter', 'bowler', 'fielder'];
    const awardIn = {};
    for (const m of moms) {
      const held = awardIn[m.matchId];
      if (!held || AWARD_RANK.indexOf(m.kind) < AWARD_RANK.indexOf(held)) awardIn[m.matchId] = m.kind;
    }
    const runsBy = {}, wktsBy = {};
    for (const b of fBat) {
      const id = b.over.inning.matchId;
      runsBy[id] = (runsBy[id] || 0) + b.runs;
    }
    for (const b of fBowl) {
      if (!isBowlerWicket(b)) continue;   // run-outs aren't the bowler's
      const id = b.over.inning.matchId;
      wktsBy[id] = (wktsBy[id] || 0) + 1;
    }
    recentForm = formRows.map((r) => {
      const m = r.match;
      const mine = r.team?.name || '';
      const opponent = m.team1?.name === mine ? m.team2?.name : m.team1?.name;
      const res = m.result || '';
      let result = null;
      if (mine && res.startsWith(mine)) result = 'W';
      else if (res && !/tie/i.test(res)) result = 'L';
      return {
        matchId: m.id,
        opponent: opponent || 'Unknown',
        result,
        runs: runsBy[m.id] ?? null,
        wickets: wktsBy[m.id] ?? null,
        isMOM: momIds.has(m.id),
        // 'motm' | 'fighter' | 'batter' | 'bowler' | 'fielder' | null —
        // what they took home from that match, if anything.
        award: awardIn[m.id] || null,
      };
    });
  }

  const envelope = {
    sport: player.sport,
    role: player.role,
    team: player.team?.name || null,
    linked: true,
  };

  // ── Non-cricket career stats ───────────────────────────────────────────────
  // Cricket's numbers come from the ball-by-ball tables above. Every other sport
  // records SportEvents instead, so a career line is just that player's events
  // tallied by type (goals, cards, …) across their matches. Returning the raw
  // tally keeps this generic — the app decides which types to show and what to
  // call them, so a new sport needs no change here.
  if (player.sport && player.sport !== 'cricket') {
    const evs = await prisma.sportEvent.findMany({
      where: { playerId: { in: ids } },
      select: { matchId: true, eventType: true, value: true },
    });
    const byType = {};
    for (const e of evs) byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    const played = new Set(evs.map((e) => e.matchId)).size;

    return {
      ...envelope,
      stats: {
        ...BASE,
        matches: played || seasonMatches,
        eventTotals: byType,               // { goal: 5, 'yellow-card': 2, … }
        seasonMatches,
        awards,
        momCount: awards.motm,             // kept for older clients
        recentForm,
      },
    };
  }

  // ── Per-innings trend series ─────────────────────────────────────────────
  // The balls above already carry their inningId; this folds them up and puts
  // the innings in match order (Inning has no timestamp of its own, so the order
  // comes from its match).
  const perInnings = (rows, pick) => {
    const out = {};
    for (const r of rows) {
      const inn = r.over?.inningId;
      if (!inn) continue;
      out[inn] = (out[inn] || 0) + pick(r);
    }
    return out;
  };
  const runsByInning = perInnings(batBalls, (b) => (b.extraType === 'bye' || b.extraType === 'legBye' ? 0 : b.runs || 0));
  // This one already lowercased correctly while the career total above did not,
  // which is exactly why the two disagreed on screen. Same helper now.
  const wktsByInning = perInnings(bowlBalls, (b) => (isBowlerWicket(b) ? 1 : 0));
  const fieldByInning = perInnings(fieldBalls, () => 1);

  const seriesInningIds = [...new Set([
    ...Object.keys(runsByInning), ...Object.keys(wktsByInning), ...Object.keys(fieldByInning),
  ])];
  let orderedInnings = [];
  if (seriesInningIds.length) {
    const innings = await prisma.inning.findMany({
      where: { id: { in: seriesInningIds } },
      select: { id: true, match: { select: { createdAt: true } } },
    });
    orderedInnings = innings
      .sort((a, b) => new Date(a.match?.createdAt || 0) - new Date(b.match?.createdAt || 0))
      .slice(-10)                       // last ten appearances is what the chart plots
      .map((i) => i.id);
  }
  const seriesFor = (map) => orderedInnings.map((id) => map[id] || 0);

  return {
    ...envelope,
    stats: {
      ...BASE,
      ...s,                                   // pass through any stored fields
      matches: s.matches ?? seasonMatches,
      average: s.average ?? s.battingAverage ?? 0,
      ...computed,                            // real ball-derived numbers win
      catches,
      runOuts,
      dismissalsTaken: catches + runOuts,
      recentScores: seriesFor(runsByInning),
      recentWickets: seriesFor(wktsByInning),
      recentCatches: seriesFor(fieldByInning),
      seasonMatches,
      // { motm, fighter, batter, bowler, fielder, series, seriesBatter,
      //   seriesBowler, seriesFielder, total }
      awards,
      momCount: awards.motm,                  // kept for older clients
      recentForm,
    },
  };
}

export default { playerCareer, emptyCareer };
