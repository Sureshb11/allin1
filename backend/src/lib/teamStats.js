// Team statistics — every number on the Team → Stats tab, from one pass.
//
// THE RULE THAT SHAPES ALL OF IT: a player's numbers here are what they did FOR
// THIS TEAM. Someone who scored 900 for one club and 300 for another shows 300
// on the second club's page. That falls out of the query rather than needing a
// filter: batting is read from innings this team BATTED, bowling and fielding
// from innings it BOWLED, so a ball from another club's match is never loaded.
//
// One round trip, one traversal. The old insights endpoint ran three separate
// queries and re-walked the innings for each; this needs far more numbers than
// that did, so it loads the window once and accumulates everything together.

import { prisma } from './prisma.js';

const NON_BALL = ['wide', 'noBall', 'penalty', 'retired', 'deadBall'];
const isLegal = (b) => !NON_BALL.includes(b.extraType);
// Runs credited to the batter: not byes, leg byes, or the wide's own penalty.
const batRuns = (b) => (['bye', 'legBye', 'penalty'].includes(b.extraType) ? 0 : b.runs || 0);
// A ball the batter is judged on. A wide isn't; a no ball is.
const ballFaced = (b) => b.extraType !== 'wide' && !['penalty', 'retired', 'deadBall'].includes(b.extraType);
const div = (a, b, dp = 2) => (b > 0 ? +(a / b).toFixed(dp) : 0);
// Overs are stored as balls everywhere sane; display wants 4.3 for 27.
const oversOf = (balls) => +(Math.floor(balls / 6) + (balls % 6) / 10).toFixed(1);

// Wickets that belong to the bowler. A run out is nobody's wicket.
const BOWLER_WICKETS = ['bowled', 'lbw', 'caught', 'caughtbowled', 'candb', 'stumped', 'hitwicket'];
const bowlerWicket = (b) =>
  b.isWicket && BOWLER_WICKETS.includes(String(b.wicketType || '').toLowerCase().replace(/[\s&]/g, ''));

/**
 * @param {string} teamId
 * @param {object} filters { from, to, matchType, venue, tournamentId }
 */
export async function teamStats(teamId, filters = {}) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error('Team not found');

  // ── Which matches are in scope ────────────────────────────────────────────
  const where = {
    OR: [{ team1Id: teamId }, { team2Id: teamId }],
    status: 'completed',
  };
  if (filters.from || filters.to) {
    where.startTime = {};
    if (filters.from) where.startTime.gte = new Date(filters.from);
    if (filters.to) where.startTime.lte = new Date(filters.to);
  }
  if (filters.matchType) where.matchType = filters.matchType;
  // Case-insensitive, for the same reason the options are folded: the same
  // ground is spelled three ways in this data.
  if (filters.venue) where.venue = { equals: filters.venue, mode: 'insensitive' };
  // A tournament filter is a different question — "matches that were fixtures in
  // it" — so it resolves to ids first rather than joining.
  if (filters.tournamentId) {
    const fixtures = await prisma.tournamentMatch.findMany({
      where: { tournamentId: filters.tournamentId, matchId: { not: null } },
      select: { matchId: true },
    });
    where.id = { in: fixtures.map((f) => f.matchId) };
  }

  const matches = await prisma.match.findMany({
    where,
    orderBy: { startTime: 'asc' },
    include: {
      team1: { select: { id: true, name: true } },
      team2: { select: { id: true, name: true } },
      squads: { select: { playerId: true, teamId: true, isCaptain: true, player: { select: { name: true } } } },
      innings: {
        orderBy: { inningNumber: 'asc' },
        include: {
          oversData: {
            orderBy: { overNumber: 'asc' },
            include: {
              bowler: { select: { id: true, name: true } },
              balls: { orderBy: { ballNumber: 'asc' }, include: { batter: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  });

  // Player of the Match, by player, within the same window.
  const awards = await prisma.matchAward.findMany({
    where: { matchId: { in: matches.map((m) => m.id) }, kind: 'motm' },
    select: { playerId: true, playerName: true },
  }).catch(() => []);

  /* ── Accumulators ─────────────────────────────────────────────────────── */
  const t = {
    played: 0, won: 0, lost: 0, tied: 0, noResult: 0,
    runsFor: 0, wicketsLost: 0, ballsFaced: 0,
    wicketsTaken: 0, fours: 0, sixes: 0, extras: 0,
    highest: null, lowest: null,
    bestChase: null, lowestDefended: null,
    bestWinRuns: null, bestWinWickets: null,
    tossWon: 0, tossKnown: 0,
    batFirstWins: 0, batFirstPlayed: 0, fieldFirstWins: 0, fieldFirstPlayed: 0,
    homeWins: 0, homePlayed: 0, awayWins: 0, awayPlayed: 0,
    firstInningsRuns: 0, firstInningsCount: 0,
    secondInningsRuns: 0, secondInningsCount: 0,
  };
  const bat = {};   // playerId → batting for THIS team
  const bowl = {};  // playerId → bowling for THIS team
  const field = {}; // name    → fielding for THIS team (assists are stored as names)
  const capWins = {};
  const results = []; // 'W' | 'L' | 'T' | 'N', in playing order, for streaks

  const B = (id, name) => (bat[id] ||= { id, name, matches: new Set(), innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, out: 0, best: 0, fifties: 0, hundreds: 0 });
  const W = (id, name) => (bowl[id] ||= { id, name, matches: new Set(), balls: 0, runs: 0, wickets: 0, dots: 0, threes: 0, fives: 0, bestW: 0, bestR: 0 });
  const F = (name) => (field[name] ||= { name, catches: 0, runOuts: 0, stumpings: 0 });

  const homeGround = (team.homeGround || '').trim().toLowerCase();

  for (const m of matches) {
    t.played++;
    const isTeam1 = m.team1Id === teamId;
    const opponentId = isTeam1 ? m.team2Id : m.team1Id;
    const res = String(m.result || '').toLowerCase();
    const noResult = /no result|abandon/.test(res);
    const tied = /\btie|tied\b/.test(res);
    const won = !noResult && !tied && res.includes(String(team.name || '').toLowerCase());

    if (noResult) { t.noResult++; results.push('N'); }
    else if (tied) { t.tied++; results.push('T'); }
    else if (won) { t.won++; results.push('W'); }
    else { t.lost++; results.push('L'); }

    // Toss, and what the team did with it.
    if (m.tossWinnerId) {
      t.tossKnown++;
      if (m.tossWinnerId === teamId) t.tossWon++;
    }
    // Home is "played at our own ground", which is the only sense the data
    // supports — there is no home/away flag, just a venue string and the team's
    // own homeGround. No home ground recorded means neither is counted.
    if (homeGround && m.venue) {
      const atHome = String(m.venue).trim().toLowerCase().includes(homeGround);
      if (atHome) { t.homePlayed++; if (won) t.homeWins++; }
      else { t.awayPlayed++; if (won) t.awayWins++; }
    }

    const ours = m.innings.filter((i) => i.battingTeamId === teamId);
    const theirs = m.innings.filter((i) => i.bowlingTeamId === teamId);

    // Batting first or second, and how that went.
    const firstInn = m.innings.find((i) => i.inningNumber === 1);
    if (firstInn) {
      if (firstInn.battingTeamId === teamId) { t.batFirstPlayed++; if (won) t.batFirstWins++; }
      else if (firstInn.bowlingTeamId === teamId) { t.fieldFirstPlayed++; if (won) t.fieldFirstWins++; }
    }
    for (const inn of m.innings) {
      if (inn.inningNumber === 1) { t.firstInningsRuns += inn.totalRuns; t.firstInningsCount++; }
      if (inn.inningNumber === 2) { t.secondInningsRuns += inn.totalRuns; t.secondInningsCount++; }
    }

    // ── Our batting innings ──
    for (const inn of ours) {
      t.runsFor += inn.totalRuns;
      t.wicketsLost += inn.totalWickets;
      // An innings with no over bowled in it never happened — a match set up and
      // abandoned, or the second innings of a game that ended in the first.
      // Three of this team's sixteen are like that, and counting them made its
      // "lowest score" 0 and its "lowest total defended" 12. Extremes only look
      // at innings that were actually played; the totals above are unaffected,
      // since adding zero changes nothing.
      const played = inn.oversData.length > 0;
      if (!played) continue;
      if (t.highest === null || inn.totalRuns > t.highest) t.highest = inn.totalRuns;
      if (t.lowest === null || inn.totalRuns < t.lowest) t.lowest = inn.totalRuns;
      // A successful chase is a second innings we batted and won.
      if (inn.inningNumber === 2 && won && (t.bestChase === null || inn.totalRuns > t.bestChase)) t.bestChase = inn.totalRuns;
      // A defended total is a first innings we batted and won.
      if (inn.inningNumber === 1 && won && (t.lowestDefended === null || inn.totalRuns < t.lowestDefended)) t.lowestDefended = inn.totalRuns;

      const perInnings = {};
      for (const ov of inn.oversData) {
        for (const b of ov.balls) {
          if (isLegal(b)) t.ballsFaced++;
          t.extras += b.extras || 0;
          const r = batRuns(b);
          if (!b.extraType && r === 4) t.fours++;
          if (!b.extraType && r === 6) t.sixes++;
          const p = B(b.batterId, b.batter?.name);
          p.matches.add(m.id);
          (perInnings[b.batterId] ||= { runs: 0, balls: 0 });
          if (ballFaced(b)) { p.balls++; perInnings[b.batterId].balls++; }
          p.runs += r; perInnings[b.batterId].runs += r;
          if (!b.extraType && r === 4) p.fours++;
          if (!b.extraType && r === 6) p.sixes++;
          if (b.isWicket && b.dismissedPlayerId) {
            const d = B(b.dismissedPlayerId, null);
            d.out++;
          }
        }
      }
      for (const [pid, s] of Object.entries(perInnings)) {
        const p = bat[pid];
        if (!p) continue;
        p.innings++;
        if (s.runs > p.best) p.best = s.runs;
        if (s.runs >= 100) p.hundreds++;
        else if (s.runs >= 50) p.fifties++;
      }
    }

    // ── Our bowling innings ──
    for (const inn of theirs) {
      for (const ov of inn.oversData) {
        for (const b of ov.balls) {
          const bid = b.bowlerId || ov.bowlerId;
          if (!bid) continue;
          const p = W(bid, ov.bowler?.name);
          p.matches.add(m.id);
          if (isLegal(b)) p.balls++;
          // Charged to the bowler: runs off the bat plus wides and no balls, not byes.
          const conceded = (b.runs || 0) + (['wide', 'noBall'].includes(b.extraType) ? (b.extras || 0) : 0);
          p.runs += conceded;
          if (isLegal(b) && conceded === 0 && !b.isWicket) p.dots++;
          if (bowlerWicket(b)) { p.wickets++; t.wicketsTaken++; }
          // Fielding credit — the scorer records a NAME, and on our bowling
          // innings that name is one of ours.
          if (b.isWicket && b.wicketAssists) {
            const wt = String(b.wicketType || '').toLowerCase().replace(/[\s&]/g, '');
            const f = F(b.wicketAssists);
            if (wt === 'caught' || wt === 'caughtbowled' || wt === 'candb') f.catches++;
            else if (wt === 'stumped') f.stumpings++;
            else if (wt === 'runout') f.runOuts++;
          }
        }
      }
    }

    // Captain's record — the squad row says who led, for this team, in this match.
    const cap = m.squads.find((s) => s.teamId === teamId && s.isCaptain);
    if (cap && won) capWins[cap.playerId] = (capWins[cap.playerId] || 0) + 1;

    // Winning margin, from the two innings totals.
    if (won && m.innings.length === 2) {
      const our = ours[0], their = theirs.find((i) => i.battingTeamId === opponentId);
      if (our && their) {
        if (our.inningNumber === 1) {
          const by = our.totalRuns - their.totalRuns;
          if (by > 0 && (t.bestWinRuns === null || by > t.bestWinRuns)) t.bestWinRuns = by;
        } else {
          // One short of the XI. Squads here run from 1 to 15, so a fixed ten
          // reports a side that lost 7 of its 8 as having 3 in hand.
          const xi = m.squads.filter((s) => s.teamId === teamId).length || 11;
          const wicketsInHand = Math.max(0, Math.max(1, xi - 1) - our.totalWickets);
          if (t.bestWinWickets === null || wicketsInHand > t.bestWinWickets) t.bestWinWickets = wicketsInHand;
        }
      }
    }
  }

  // Best bowling in an innings needs a per-innings pass; done above by over
  // aggregate would double-count shared overs, so it is derived here from the
  // per-match figures the loop already has.
  for (const m of matches) {
    for (const inn of m.innings.filter((i) => i.bowlingTeamId === teamId)) {
      const perInn = {};
      for (const ov of inn.oversData) {
        for (const b of ov.balls) {
          const bid = b.bowlerId || ov.bowlerId;
          if (!bid) continue;
          (perInn[bid] ||= { w: 0, r: 0 });
          perInn[bid].r += (b.runs || 0) + (['wide', 'noBall'].includes(b.extraType) ? (b.extras || 0) : 0);
          if (bowlerWicket(b)) perInn[bid].w++;
        }
      }
      for (const [bid, s] of Object.entries(perInn)) {
        const p = bowl[bid];
        if (!p) continue;
        if (s.w >= 5) p.fives++;
        else if (s.w >= 3) p.threes++;
        if (s.w > p.bestW || (s.w === p.bestW && s.r < p.bestR)) { p.bestW = s.w; p.bestR = s.r; }
      }
    }
  }

  /* ── Streaks ──────────────────────────────────────────────────────────── */
  const streak = (want) => {
    let best = 0, run = 0;
    for (const r of results) { run = r === want ? run + 1 : 0; if (run > best) best = run; }
    return best;
  };
  let current = { kind: null, count: 0 };
  for (let i = results.length - 1; i >= 0; i--) {
    if (current.kind === null) { current = { kind: results[i], count: 1 }; continue; }
    if (results[i] === current.kind) current.count++;
    else break;
  }

  const motm = {};
  for (const a of awards) {
    const key = a.playerId || `name:${a.playerName}`;
    (motm[key] ||= { id: a.playerId, name: a.playerName, count: 0 }).count++;
  }

  const batList = Object.values(bat).filter((p) => p.name);
  const bowlList = Object.values(bowl).filter((p) => p.name);

  const top = (arr, n = 10) => arr.slice(0, n);
  const battingRows = batList.map((p) => ({
    playerId: p.id, name: p.name, matches: p.matches.size, innings: p.innings,
    runs: p.runs, balls: p.balls, notOuts: Math.max(0, p.innings - p.out),
    average: p.out > 0 ? div(p.runs, p.out) : p.runs || 0,
    strikeRate: div(p.runs * 100, p.balls, 1),
    highest: p.best, fours: p.fours, sixes: p.sixes, fifties: p.fifties, hundreds: p.hundreds,
  }));
  const bowlingRows = bowlList.map((p) => ({
    playerId: p.id, name: p.name, matches: p.matches.size,
    balls: p.balls, overs: oversOf(p.balls), runs: p.runs, wickets: p.wickets,
    economy: p.balls > 0 ? div(p.runs * 6, p.balls) : 0,
    average: p.wickets > 0 ? div(p.runs, p.wickets) : 0,
    best: p.bestW > 0 ? `${p.bestW}/${p.bestR}` : '—',
    bestW: p.bestW, bestR: p.bestR,
    threes: p.threes, fives: p.fives, dots: p.dots,
  }));
  const fieldingRows = Object.values(field).map((f) => ({
    name: f.name, catches: f.catches, runOuts: f.runOuts, stumpings: f.stumpings,
    dismissals: f.catches + f.runOuts + f.stumpings,
  }));

  // Qualification thresholds, scaled to how much cricket there is: a strike rate
  // off one innings is noise, and so is an economy off one over.
  const minInnings = Math.max(2, Math.round(t.played * 0.25));
  const minOvers = Math.max(2, Math.round(t.played * 0.5));

  return {
    team: { id: team.id, name: team.name, logoUrl: team.logoUrl },
    filters,
    matchCount: matches.length,
    team_stats: {
      played: t.played, won: t.won, lost: t.lost, tied: t.tied, noResult: t.noResult,
      winPct: div(t.won * 100, t.played, 1),
      highestScore: t.highest, lowestScore: t.lowest,
      bestChase: t.bestChase, lowestDefended: t.lowestDefended,
      avgScore: div(t.runsFor, Math.max(1, t.played), 1),
      runRate: div(t.runsFor * 6, Math.max(1, t.ballsFaced)),
      avgWicketsLost: div(t.wicketsLost, Math.max(1, t.played), 1),
      totalRuns: t.runsFor, totalWickets: t.wicketsTaken,
      fours: t.fours, sixes: t.sixes, boundaries: t.fours + t.sixes, extras: t.extras,
      bestWinRuns: t.bestWinRuns, bestWinWickets: t.bestWinWickets,
      longestWinStreak: streak('W'), longestLossStreak: streak('L'),
      currentStreak: current.count ? `${current.count}${current.kind}` : '—',
      homeWins: t.homeWins, homePlayed: t.homePlayed,
      awayWins: t.awayWins, awayPlayed: t.awayPlayed,
      tossWinPct: div(t.tossWon * 100, Math.max(1, t.tossKnown), 1),
      batFirstWins: t.batFirstWins, batFirstPlayed: t.batFirstPlayed,
      fieldFirstWins: t.fieldFirstWins, fieldFirstPlayed: t.fieldFirstPlayed,
      avgFirstInnings: div(t.firstInningsRuns, Math.max(1, t.firstInningsCount), 1),
      avgSecondInnings: div(t.secondInningsRuns, Math.max(1, t.secondInningsCount), 1),
      form: results.slice(-5),
    },
    leaderboards: {
      runs:       top([...battingRows].sort((a, b) => b.runs - a.runs || b.average - a.average)),
      wickets:    top([...bowlingRows].sort((a, b) => b.wickets - a.wickets || a.economy - b.economy)),
      economy:    top([...bowlingRows].filter((p) => p.balls >= minOvers * 6).sort((a, b) => a.economy - b.economy)),
      sixes:      top([...battingRows].filter((p) => p.sixes > 0).sort((a, b) => b.sixes - a.sixes)),
      fours:      top([...battingRows].filter((p) => p.fours > 0).sort((a, b) => b.fours - a.fours)),
      highest:    top([...battingRows].filter((p) => p.highest > 0).sort((a, b) => b.highest - a.highest)),
      strikeRate: top([...battingRows].filter((p) => p.innings >= minInnings && p.balls > 0).sort((a, b) => b.strikeRate - a.strikeRate)),
      catches:    top([...fieldingRows].filter((f) => f.catches > 0).sort((a, b) => b.catches - a.catches)),
      runOuts:    top([...fieldingRows].filter((f) => f.runOuts > 0).sort((a, b) => b.runOuts - a.runOuts)),
      stumpings:  top([...fieldingRows].filter((f) => f.stumpings > 0).sort((a, b) => b.stumpings - a.stumpings)),
      dismissals: top([...fieldingRows].filter((f) => f.dismissals > 0).sort((a, b) => b.dismissals - a.dismissals)),
      motm:       top(Object.values(motm).sort((a, b) => b.count - a.count)),
      appearances: top([...battingRows].sort((a, b) => b.matches - a.matches)),
      captainWins: top(Object.entries(capWins)
        .map(([id, wins]) => ({ playerId: id, name: bat[id]?.name || bowl[id]?.name || 'Captain', wins }))
        .sort((a, b) => b.wins - a.wins)),
    },
    qualification: { minInnings, minOvers },
  };
}

// The values the filter controls should offer — derived from this team's own
// matches, so a ground or a match type that never happened is never offered.
export async function teamStatsFilterOptions(teamId) {
  const matches = await prisma.match.findMany({
    where: { OR: [{ team1Id: teamId }, { team2Id: teamId }], status: 'completed' },
    select: { id: true, startTime: true, matchType: true, venue: true },
  });
  const years = [...new Set(matches.map((m) => m.startTime && new Date(m.startTime).getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  const matchTypes = [...new Set(matches.map((m) => m.matchType).filter(Boolean))].sort();
  // Venues are free text and typed by hand — this team has "Chennai", "CHENNAI"
  // and "chennai" as three separate grounds. Fold on case so the filter offers
  // one entry, labelled with the spelling used most often.
  const venueCounts = {};
  for (const m of matches) {
    const v = (m.venue || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    (venueCounts[key] ||= {})[v] = ((venueCounts[key] || {})[v] || 0) + 1;
  }
  const venues = Object.values(venueCounts)
    .map((spellings) => Object.entries(spellings).sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b));
  const fixtures = await prisma.tournamentMatch.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { tournament: { select: { id: true, name: true } } },
  });
  const seen = new Set();
  const tournaments = [];
  for (const f of fixtures) {
    if (f.tournament && !seen.has(f.tournament.id)) { seen.add(f.tournament.id); tournaments.push(f.tournament); }
  }
  return { years, matchTypes, venues, tournaments };
}
