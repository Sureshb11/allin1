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
import { isBowlerWicket, inningsPhase } from './deliveries.js';

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
  const [batBalls, outsByType, bowlBalls, xiMatches, awards, catches, runOuts, fieldBalls,
         dropRows, directHits, dismissalBalls, standBalls] = await Promise.all([
    prisma.ball.findMany({
      where: { batterId: { in: ids } },
      // overNumber + the match's allowance are for the phase split: whether a
      // ball was faced in the powerplay depends on how long the match was.
      select: { runs: true, extraType: true,
                over: { select: { inningId: true, overNumber: true,
                                  inning: { select: { match: { select: { overs: true } } } } } } },
    }),
    // How the player got out, not just how often. Same rows the plain count
    // read before — the total is the sum — but it can now answer "you are lbw
    // a third of the time", which a number on its own never could.
    prisma.ball.groupBy({
      by: ['wicketType'],
      where: { dismissedPlayerId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.ball.findMany({
      where: { over: { bowlerId: { in: ids } } },
      // over.id and the two bowlerIds are for maidens: an over is only a maiden
      // if ONE bowler sent down all of it, so the balls have to be grouped by
      // over and checked for a shared spell.
      select: { runs: true, extras: true, extraType: true, isWicket: true, wicketType: true,
                bowlerId: true,
                over: { select: { id: true, inningId: true, bowlerId: true, overNumber: true,
                                  inning: { select: { match: { select: { overs: true } } } } } } },
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
    // Drops and direct hits: recorded on every ball since the columns were
    // added, aggregated nowhere. Both are matched by NAME, like wicketAssists
    // above and for the same reason.
    prisma.ball.groupBy({
      by: ['dropDifficulty'],
      where: { droppedBy: fieldName },
      _count: { _all: true },
    }),
    prisma.ball.count({ where: { directHit: true, wicketAssists: fieldName } }),
    // Who keeps getting you out. Every dismissal already records the bowler;
    // nothing had ever grouped them by one.
    prisma.ball.findMany({
      where: { isWicket: true, dismissedPlayerId: { in: ids } },
      select: { wicketType: true, isWicket: true, bowlerId: true, over: { select: { bowlerId: true } } },
    }),
    // Partnerships. Each ball names both ends, so a stand is every ball sharing
    // an innings and a pair — runs AND extras, which is what a partnership is.
    prisma.ball.findMany({
      where: { OR: [{ batterId: { in: ids } }, { nonStrikerId: { in: ids } }] },
      select: { runs: true, extras: true, batterId: true, nonStrikerId: true,
                over: { select: { inningId: true } } },
    }),
  ]);

  // The plain dismissal count the batting maths below still needs.
  const dismissals = outsByType.reduce((t, r) => t + r._count._all, 0);

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
  // Exactly four, not four-or-more: the 4w and 5w columns sit side by side on
  // an international career page and a five-for belongs in one of them, not
  // both.
  const appFourWickets = Object.values(fig).filter((f) => f.w === 4).length;
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
  computed.fourWickets = (s.fourWickets || 0) + appFourWickets;
  computed.dotBalls = (s.dotBalls || 0) + appDotBalls;
  computed.wides = (s.wides || 0) + appWides;
  computed.noBalls = (s.noBalls || 0) + appNoBalls;
  computed.foursConceded = (s.foursConceded || 0) + appFoursConceded;
  computed.sixesConceded = (s.sixesConceded || 0) + appSixesConceded;

  // Maidens: an over with six legal balls and nothing charged to the bowler.
  //
  // This read `s.maidens || 0` — the imported historical figure and nothing
  // else — so every maiden bowled in the app went uncounted, while the team
  // page (teamStats.js) had been deriving them from the same balls all along.
  // A shared over belongs to neither bowler, which is why the spell has to be
  // checked rather than just the runs.
  const byOver = {};
  for (const b of bowlBalls) (byOver[b.over.id] ||= []).push(b);
  const appMaidens = Object.values(byOver).filter((balls) => {
    const spell = new Set(balls.map((b) => b.bowlerId || b.over.bowlerId));
    if (spell.size !== 1) return false;                       // shared over
    if (balls.filter(isLegal).length < 6) return false;       // unfinished
    return balls.reduce((t, b) => t + chargedRuns(b), 0) === 0;
  }).length;
  computed.maidens = (s.maidens || 0) + appMaidens;
  computed.bowlingStrikeRate = totalWickets ? +(totalBallsBowled / totalWickets).toFixed(1) : (s.bowlingStrikeRate || 0);

  computed.matches = (s.matches || 0) + xiMatches;

  // ── Fielding, past the two numbers it had ────────────────────────────────
  // Catches and run-outs were the whole panel. The scorer has also been
  // recording who shelled a chance and whether a run-out was a direct hit —
  // the schema calls drops "half the story" in amateur cricket — and none of
  // it reached the player. Catch rate needs both halves to mean anything.
  const dropsEasy = dropRows.find((r) => r.dropDifficulty === 'easy')?._count._all || 0;
  const dropsHard = dropRows.find((r) => r.dropDifficulty === 'difficult')?._count._all || 0;
  const drops = dropRows.reduce((t, r) => t + r._count._all, 0);
  computed.drops = drops;
  // The easy/hard split of nothing is nothing: null so the panel drops those
  // two rows rather than printing a breakdown of zero, the same way catchRate
  // stays null until there has been a chance to take.
  computed.dropsEasy = drops ? dropsEasy : null;
  computed.dropsDifficult = drops ? dropsHard : null;
  computed.directHits = directHits;
  const chances = catches + drops;
  computed.catchRate = chances ? +((catches / chances) * 100).toFixed(1) : null;

  // ── How the player gets out ──────────────────────────────────────────────
  // Keyed by the stored spelling, lowercased so the panel can read it without
  // repeating the casing trap that credited run-outs to bowlers.
  computed.dismissalTypes = Object.fromEntries(
    outsByType
      .filter((r) => r.wicketType)
      .map((r) => [String(r.wicketType).toLowerCase().replace(/\s/g, ''), r._count._all]),
  );
  computed.dismissals = dismissals;

  // ── Batting shape ────────────────────────────────────────────────────────
  // Two batters averaging 30 can be opposite players; these say which is which.
  const boundaryRuns = computed.fours * 4 + computed.sixes * 6;
  computed.boundaryPercent = runs ? +((boundaryRuns / runs) * 100).toFixed(1) : null;
  computed.dotBallPercent = totalFaced
    ? +((computed.battingDotBalls / totalFaced) * 100).toFixed(1) : null;
  const boundaries = computed.fours + computed.sixes;
  computed.ballsPerBoundary = boundaries ? +(totalFaced / boundaries).toFixed(1) : null;

  // ── Powerplay / middle / death ───────────────────────────────────────────
  // A career economy of 8 is one bowler at the death and a different one in the
  // middle. Every over already carried its number; nothing had ever asked when
  // in the innings the runs happened.
  //
  // Below one full over in a phase the rate is noise — a single expensive over
  // reads as an economy of 24 — so a phase with less than six legal balls
  // reports null and the row drops out rather than libelling anyone.
  const MIN_PHASE_BALLS = 6;
  const phaseOf = (b) => {
    const limit = b.over?.inning?.match?.overs;
    return inningsPhase(b.over?.overNumber, limit);
  };
  const emptyPhases = () => ({
    powerplay: { runs: 0, balls: 0, wickets: 0 },
    middle:    { runs: 0, balls: 0, wickets: 0 },
    death:     { runs: 0, balls: 0, wickets: 0 },
  });

  const bowlPhases = emptyPhases();
  for (const b of bowled) {
    const p = phaseOf(b);
    if (!p) continue;
    bowlPhases[p].runs += chargedRuns(b);
    if (isLegal(b)) bowlPhases[p].balls += 1;
    if (isBowlerWicket(b)) bowlPhases[p].wickets += 1;
  }
  const batPhases = emptyPhases();
  for (const b of batBalls) {
    const p = phaseOf(b);
    if (!p) continue;
    batPhases[p].runs += b.runs;
    if (b.extraType !== 'wide') batPhases[p].balls += 1;
  }

  const rate = (o, per) => (o.balls >= MIN_PHASE_BALLS ? +(o.runs / (o.balls / per)).toFixed(2) : null);
  computed.phases = {
    // Economy is runs per over; strike rate is runs per 100 balls.
    bowling: Object.fromEntries(Object.entries(bowlPhases).map(([k, o]) =>
      [k, { ...o, economy: rate(o, 6) }])),
    batting: Object.fromEntries(Object.entries(batPhases).map(([k, o]) =>
      [k, { ...o, strikeRate: o.balls >= MIN_PHASE_BALLS ? +((o.runs / o.balls) * 100).toFixed(1) : null }])),
  };

  // ── The people in your cricket ───────────────────────────────────────────
  // A nemesis and a favourite partner are the two facts a player will actually
  // repeat to someone else, and both were already sitting in the ball log: every
  // dismissal names its bowler, every delivery names both ends.
  const nemesisCount = {};
  for (const b of dismissalBalls) {
    if (!isBowlerWicket(b)) continue;                 // a run-out is nobody's spell
    const bw = b.bowlerId || b.over?.bowlerId;
    if (!bw || ids.includes(bw)) continue;            // don't count yourself
    nemesisCount[bw] = (nemesisCount[bw] || 0) + 1;
  }

  // A stand is one innings and one pair of ends. Extras count: they are runs the
  // partnership put on, which is why a partnership total is not two batters'
  // scores added together.
  const stands = {};
  for (const b of standBalls) {
    const inn = b.over?.inningId;
    if (!inn) continue;
    const partner = ids.includes(b.batterId) ? b.nonStrikerId : b.batterId;
    if (!partner || ids.includes(partner)) continue;  // both ends can't be the same person
    const k = `${inn}|${partner}`;
    stands[k] = stands[k] || { partner, runs: 0 };
    stands[k].runs += b.runs + b.extras;
  }

  const topNemesis = Object.entries(nemesisCount).sort((a, b) => b[1] - a[1])[0];
  const topStand = Object.values(stands).sort((a, b) => b.runs - a.runs)[0];
  const lookupIds = [topNemesis?.[0], topStand?.partner].filter(Boolean);
  const names = lookupIds.length
    ? Object.fromEntries((await prisma.player.findMany({
        where: { id: { in: lookupIds } }, select: { id: true, name: true },
      })).map((p) => [p.id, p.name]))
    : {};

  computed.nemesisOuts = topNemesis ? topNemesis[1] : null;
  computed.nemesisName = topNemesis ? (names[topNemesis[0]] || null) : null;
  computed.bestPartnership = topStand ? topStand.runs : null;
  computed.bestPartnershipWith = topStand ? (names[topStand.partner] || null) : null;

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
    // One reading of the free-text result, used by both the form strip and the
    // career record below. Two copies of this would drift the moment the
    // sentence format changed, and only one of them would be noticed.
    const outcomeOf = (r) => {
      const mine = r.team?.name || '';
      const res = r.match?.result || '';
      if (mine && res.startsWith(mine)) return 'W';
      if (res && !/tie/i.test(res)) return 'L';
      return null;
    };

    recentForm = formRows.map((r) => {
      const m = r.match;
      const mine = r.team?.name || '';
      const opponent = m.team1?.name === mine ? m.team2?.name : m.team1?.name;
      const result = outcomeOf(r);
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

    // Every international career page leads with a played/won line, and this
    // one had the answer in hand and never totalled it.
    //
    // Counted off formRows, not off recentForm: that array is what the form
    // strip renders, and the day someone caps it to the last five the record
    // would quietly become a last-five record instead.
    //
    // Ties and results the parser can't read stay out of both columns rather
    // than being guessed into one, so wins + losses can be short of matches.
    const outcomes = formRows.map(outcomeOf).filter(Boolean);
    computed.wins = outcomes.filter((o) => o === 'W').length;
    computed.losses = outcomes.filter((o) => o === 'L').length;
    computed.winPercent = outcomes.length
      ? +((computed.wins / outcomes.length) * 100).toFixed(1) : null;
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
