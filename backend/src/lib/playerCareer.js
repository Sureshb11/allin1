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

const BASE = { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 };

/** The shape returned when there's no player to report on. */
export const emptyCareer = (sport = null) => ({ stats: { ...BASE }, sport, linked: false });

/**
 * Everything the career screens draw, for one Player row (include its `team`).
 * Returns { stats, sport, role, team, linked } — the same envelope both routes
 * hand back, so My Stats and a tapped player render from identical data.
 */
export async function playerCareer(player) {
  if (!player) return emptyCareer();

  const s = player.stats || {};
  // Real season match count = matches this player's team has played in their sport.
  const seasonMatches = player.teamId
    ? await prisma.match.count({ where: { sport: player.sport, OR: [{ team1Id: player.teamId }, { team2Id: player.teamId }] } })
    : 0;

  // Fielding: the scorer records the fielder as a NAME on Ball.wicketAssists —
  // the catch picker holds their id and discards it — so this can only be
  // matched back by name. wicketType separates the two: run-outs write to the
  // same column, and counting them as catches would make every fielder a slip.
  const fieldName = (player.name || '').trim();
  const [batBalls, dismissals, bowlBalls, xiMatches, awards, catches, runOuts, fieldBalls] = await Promise.all([
    prisma.ball.findMany({
      where: { batterId: player.id },
      select: { runs: true, extraType: true, over: { select: { inningId: true } } },
    }),
    prisma.ball.count({ where: { dismissedPlayerId: player.id } }),
    prisma.ball.findMany({
      where: { over: { bowlerId: player.id } },
      select: { runs: true, extras: true, extraType: true, isWicket: true, wicketType: true, over: { select: { inningId: true } } },
    }),
    prisma.matchPlayer.count({ where: { playerId: player.id } }),
    // The honours cabinet: Man of the Match, Fighter, Best Batter / Bowler /
    // Fielder, plus the series awards.
    careerAwards(player.id),
    prisma.ball.count({ where: { isWicket: true, wicketType: 'caught', wicketAssists: fieldName } }),
    prisma.ball.count({ where: { isWicket: true, wicketType: 'runout', wicketAssists: fieldName } }),
    // Per-innings fielding, for the trend chart.
    prisma.ball.findMany({
      where: { isWicket: true, wicketAssists: fieldName, wicketType: { in: ['caught', 'runout'] } },
      select: { over: { select: { inningId: true } } },
    }),
  ]);

  const computed = {};
  if (batBalls.length) {
    const runs = batBalls.reduce((t, b) => t + b.runs, 0);
    const faced = batBalls.filter((b) => b.extraType !== 'wide').length;
    // Per-innings totals → high score, 50s, 100s.
    const perInning = {};
    for (const b of batBalls) perInning[b.over.inningId] = (perInning[b.over.inningId] || 0) + b.runs;
    const innScores = Object.values(perInning);
    computed.runs          = runs;
    computed.ballsFaced    = faced;
    computed.strikeRate    = faced ? +(runs / faced * 100).toFixed(1) : 0;
    computed.average       = dismissals ? +(runs / dismissals).toFixed(1) : runs;
    computed.highestScore  = Math.max(0, ...innScores);
    computed.centuries     = innScores.filter((r) => r >= 100).length;
    computed.halfCenturies = innScores.filter((r) => r >= 50 && r < 100).length;
    computed.fours         = batBalls.filter((b) => b.runs === 4).length;
    computed.sixes         = batBalls.filter((b) => b.runs === 6).length;
    computed.notOuts       = Math.max(0, innScores.length - dismissals);
  }

  if (bowlBalls.length) {
    // ── What a delivery costs its bowler ──────────────────────────────────────
    // These two rules are the scorecard's (ScorecardScreen → computeBowling, and
    // the same in lib/mvp.js and lib/leaderboard.js): wides cost their extras, a
    // no-ball costs the extras and whatever was hit off it, byes and leg-byes
    // cost nothing (they aren't the bowler's), and a penalty or retirement isn't
    // a delivery at all.
    const chargedRuns = (b) =>
      b.extraType === 'wide' ? b.extras
      : b.extraType === 'noBall' ? b.runs + b.extras
      : (b.extraType && b.extraType !== 'bye' && b.extraType !== 'legBye') ? 0
      : (b.extraType ? 0 : b.runs);
    // One of the over's six. Wides and no-balls are re-bowled; a penalty,
    // retirement or dead ball was never bowled.
    const isLegal = (b) => !['wide', 'noBall', 'penalty', 'retired', 'deadBall'].includes(b.extraType);
    // A boundary is one hit off the bat — four byes are not the bowler's four.
    const offTheBat = (b) => !b.extraType || b.extraType === 'noBall';

    const bowled = bowlBalls.filter((b) => b.extraType !== 'penalty');
    const legal = bowled.filter(isLegal).length;
    const conceded = bowled.reduce((t, b) => t + chargedRuns(b), 0);
    const wickets = bowled.filter((b) => b.isWicket && b.wicketType !== 'runOut').length;
    // Per-innings figures → best bowling ("3/12") + five-wicket hauls.
    const fig = {};
    for (const b of bowled) {
      const k = b.over.inningId;
      fig[k] = fig[k] || { w: 0, r: 0 };
      fig[k].r += chargedRuns(b);
      if (b.isWicket && b.wicketType !== 'runOut') fig[k].w += 1;
    }
    const best = Object.values(fig).sort((a, b) => b.w - a.w || a.r - b.r)[0];
    computed.wickets        = wickets;
    computed.ballsBowled    = legal;
    computed.oversBowled    = `${Math.floor(legal / 6)}.${legal % 6}`;
    computed.runsConceded   = conceded;
    computed.economy        = legal ? +(conceded / (legal / 6)).toFixed(2) : 0;
    computed.bowlingAverage = wickets ? +(conceded / wickets).toFixed(1) : null;
    computed.bestBowling    = best ? `${best.w}/${best.r}` : null;
    computed.fiveWickets    = Object.values(fig).filter((f) => f.w >= 5).length;
    // A dot is a delivery that cost the bowler nothing — the same test the
    // scorecard applies six times over to call an over a maiden, so a leg bye
    // scampered off a good ball doesn't take the dot away from the bowler.
    computed.dotBalls       = bowled.filter((b) => isLegal(b) && chargedRuns(b) === 0).length;
    computed.foursConceded  = bowled.filter((b) => offTheBat(b) && b.runs === 4).length;
    computed.sixesConceded  = bowled.filter((b) => offTheBat(b) && b.runs === 6).length;
  }
  if (xiMatches) computed.matches = xiMatches;

  // ── Recent form: the player's last 5 completed matches ────────────────────
  // Win/loss comes from Match.result, which is free text ("<Team> won by 42
  // runs") — so we match it against the player's own team name rather than
  // inventing a column. A tie (or an unparseable result) yields result: null,
  // which the client renders neutrally.
  const formRows = await prisma.matchPlayer.findMany({
    where: { playerId: player.id, match: { status: 'completed' } },
    orderBy: { match: { startTime: 'desc' } },
    take: 5,
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
        where: { batterId: player.id, over: { inning: { matchId: { in: formMatchIds } } } },
        select: { runs: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      prisma.ball.findMany({
        where: { over: { bowlerId: player.id, inning: { matchId: { in: formMatchIds } } } },
        select: { isWicket: true, wicketType: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      // Awards won in these matches. Reads the award table, not the MVP points
      // ledger — that has a row per squad player per match, so counting it was
      // counting every appearance as a Man of the Match.
      prisma.matchAward.findMany({
        where: { playerId: player.id, matchId: { in: formMatchIds } },
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
      if (!b.isWicket || b.wicketType === 'runOut') continue;   // run-outs aren't the bowler's
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
      where: { playerId: player.id },
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
  const wktsByInning = perInnings(bowlBalls, (b) => {
    if (!b.isWicket) return 0;
    const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
    // Run-outs and retirements are never the bowler's wicket.
    return (wt === 'runout' || wt === 'retired' || wt === 'retiredout' || wt === 'retiredhurt') ? 0 : 1;
  });
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
