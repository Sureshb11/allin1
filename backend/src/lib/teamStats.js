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
import { isLegalDelivery, isBowlerWicket } from './deliveries.js';
import { venueKey } from './venue.js';

// One definition, in lib/deliveries.js — this list used to exist here, in
// mvp.js and in routes/matches.js, identically and separately.
const isLegal = isLegalDelivery;
// Runs credited to the batter: not byes, leg byes, or the wide's own penalty.
const batRuns = (b) => (['bye', 'legBye', 'penalty'].includes(b.extraType) ? 0 : b.runs || 0);
// A ball the batter is judged on. A wide isn't; a no ball is.
const ballFaced = (b) => b.extraType !== 'wide' && !['penalty', 'retired', 'deadBall'].includes(b.extraType);
const div = (a, b, dp = 2) => (b > 0 ? +(a / b).toFixed(dp) : 0);
// Overs are stored as balls everywhere sane; display wants 4.3 for 27.
const oversOf = (balls) => +(Math.floor(balls / 6) + (balls % 6) / 10).toFixed(1);

// Wickets that belong to the bowler — one definition, in lib/deliveries.js.
//
// This was an allowlist of the seven spellings someone thought of, and it named
// the wrong seven: "caught behind" and "c&b" are the bowler's wicket and were
// being refused, while the career page counted them. Naming what is NOT the
// bowler's — a run out, a retirement — is the shorter and more durable list,
// because it does not have to be extended every time a scorer writes a
// dismissal a slightly different way.
const bowlerWicket = isBowlerWicket;

/**
 * @param {string} teamId
 * @param {object} filters { from, to, matchType, venue, tournamentId }
 */
export async function teamStats(teamId, filters = {}) {
  // teamId null = "every player in these matches, whoever they played for".
  // That is what a tournament's leaderboards are, and it is the only difference
  // between them and a team's: same deliveries, same rules, same thirty-five
  // boards, a wider net. Writing a second aggregator for tournaments would mean
  // two copies of cricket's scoring rules drifting apart one fix at a time —
  // this file already carries the awkward ones (a no-ball credits the batter but
  // not the bowler's economy; a direct hit is one fielder, an assisted run-out
  // is several), and they only stay right in one place.
  //
  // The team-only figures — won/lost, home and away, toss, winning margins —
  // have no meaning without a team and are skipped rather than computed wrong;
  // the tournament route reads `leaderboards` and nothing else.
  const allTeams = !teamId;
  const team = allTeams ? null : await prisma.team.findUnique({ where: { id: teamId } });
  if (!allTeams && !team) throw new Error('Team not found');

  // ── Which matches are in scope ────────────────────────────────────────────
  const where = allTeams
    ? { status: 'completed', id: { in: filters.matchIds || [] } }
    : {
      OR: [{ team1Id: teamId }, { team2Id: teamId }],
      status: 'completed',
    };
  // A year (optionally narrowed to a month) is a window, and the query only
  // speaks windows. Resolving it here rather than in the screen means every
  // caller gets it: the Stats tab was converting year+month to from/to itself,
  // while the leaderboard sent `year=2026` straight through and the filter did
  // nothing at all — it rendered, it highlighted, it refetched, and the numbers
  // never changed.
  if (filters.year && !filters.from && !filters.to) {
    const y = Number(filters.year);
    const mo = filters.month == null || filters.month === '' ? null : Number(filters.month);
    filters = {
      ...filters,
      from: new Date(y, mo ?? 0, 1).toISOString(),
      to: (mo == null ? new Date(y, 11, 31, 23, 59, 59) : new Date(y, mo + 1, 0, 23, 59, 59)).toISOString(),
    };
  }
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
  if (filters.oppositionId) {
    where.AND = [
      { OR: [{ team1Id: teamId }, { team2Id: teamId }] },
      { OR: [{ team1Id: filters.oppositionId }, { team2Id: filters.oppositionId }] }
    ];
    delete where.OR; // Replaced by the AND block above
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
    // MATCH
    played: 0, won: 0, lost: 0, tied: 0, noResult: 0,
    // INNINGS SUMMARY
    firstInningsCount: 0, firstInningsRuns: 0,
    secondInningsCount: 0, secondInningsRuns: 0,
    // BAT & BALL (For)
    inningsFor: 0, runsFor: 0, ballsFor: 0,
    highest: 0, lowest: Infinity,
    fours: 0, sixes: 0, extras: 0,
    bestChase: null, lowestDefended: null,
    // BAT & BALL (Against)
    wicketsLost: 0, wicketsTaken: 0,
    runsAgainst: 0, ballsBowled: 0,
    // TOSS & VENUE
    tossKnown: 0, tossWon: 0,
    homePlayed: 0, homeWins: 0,
    awayPlayed: 0, awayWins: 0,
    batFirstPlayed: 0, batFirstWins: 0,
    fieldFirstPlayed: 0, fieldFirstPlayed: 0,
    // RECORDS
    bestWinRuns: null, bestWinWickets: null,
    closestWinRuns: null, closestWinWickets: null,
    biggestLossRuns: null, biggestLossWickets: null,
  };
  const bat = {};   // playerId → batting for THIS team
  const bowl = {};  // playerId → bowling for THIS team
  const field = {}; // name    → fielding for THIS team (assists are stored as names)
  const part = {};  // playerId → participation
  const capWins = {};
  const results = []; // 'W' | 'L' | 'T' | 'N', in playing order, for streaks

  const B = (id, name) => (bat[id] ||= { id, name, matches: new Set(), innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, out: 0, best: 0, fifties: 0, hundreds: 0, ducks: 0, fastest50: null, fastest100: null });
  const W = (id, name) => (bowl[id] ||= { id, name, matches: new Set(), innings: 0, balls: 0, runs: 0, wickets: 0, dots: 0, threes: 0, fives: 0, bestW: 0, bestR: 0, maidens: 0 });
  const F = (name) => (field[name] ||= { name, catches: 0, runOuts: 0, directHits: 0, assistedRunOuts: 0, stumpings: 0 });
  const P = (id, name) => (part[id] ||= { id, name, matches: 0 });

  const homeGround = (team?.homeGround || '').trim().toLowerCase();

  for (const m of matches) {
    t.played++;
    const isTeam1 = m.team1Id === teamId;
    const opponentId = isTeam1 ? m.team2Id : m.team1Id;
    const res = String(m.result || '').toLowerCase();
    const noResult = /no result|abandon/.test(res);
    const tied = /\btie|tied\b/.test(res);
    // "Did WE win" needs a we. Across a whole tournament there isn't one.
    const won = !allTeams && !noResult && !tied && res.includes(String(team.name || '').toLowerCase());

    if (!allTeams) {
      if (noResult) { t.noResult++; results.push('N'); }
      else if (tied) { t.tied++; results.push('T'); }
      else if (won) { t.won++; results.push('W'); }
      else { t.lost++; results.push('L'); }

      // Toss, and what the team did with it.
      if (m.tossWinnerId) {
        t.tossKnown++;
        if (m.tossWinnerId === teamId) t.tossWon++;
      }
    }

    // Participation
    for (const s of m.squads) {
      if (allTeams || s.teamId === teamId) {
        const p = P(s.playerId, s.player?.name);
        p.matches++;
      }
    }
    // Home is "played at our own ground", which is the only sense the data
    // supports — there is no home/away flag, just a venue string and the team's
    // own homeGround. No home ground recorded means neither is counted.
    if (homeGround && m.venue) {
      const atHome = String(m.venue).trim().toLowerCase().includes(homeGround);
      if (atHome) { t.homePlayed++; if (won) t.homeWins++; }
      else { t.awayPlayed++; if (won) t.awayWins++; }
    }

    // Every innings is "ours" when there is no us — that one line is what turns
    // this into a tournament aggregate.
    const ours = allTeams ? m.innings : m.innings.filter((i) => i.battingTeamId === teamId);
    const theirs = allTeams ? m.innings : m.innings.filter((i) => i.bowlingTeamId === teamId);

    // Batting first or second, and how that went.
    const firstInn = m.innings.find((i) => i.inningNumber === 1);
    if (firstInn && !allTeams) {
      if (firstInn.battingTeamId === teamId) { t.batFirstPlayed++; if (won) t.batFirstWins++; }
      else if (firstInn.bowlingTeamId === teamId) { t.fieldFirstPlayed++; if (won) t.fieldFirstWins++; }
    }
    for (const inn of m.innings) {
      if (inn.inningNumber === 1) { t.firstInningsRuns += inn.totalRuns; t.firstInningsCount++; }
      if (inn.inningNumber === 2) { t.secondInningsRuns += inn.totalRuns; t.secondInningsCount++; }
    }

    // ── Our batting innings ──
    for (const inn of ours) {
      t.inningsFor++;
      t.runsFor += inn.totalRuns;
      t.wicketsLost += inn.totalWickets;
      const played = inn.oversData.length > 0;
      if (!played) continue;
      if (t.highest === null || inn.totalRuns > t.highest) t.highest = inn.totalRuns;
      if (t.lowest === null || inn.totalRuns < t.lowest) t.lowest = inn.totalRuns;
      if (inn.inningNumber === 2 && won && (t.bestChase === null || inn.totalRuns > t.bestChase)) t.bestChase = inn.totalRuns;
      if (inn.inningNumber === 1 && won && (t.lowestDefended === null || inn.totalRuns < t.lowestDefended)) t.lowestDefended = inn.totalRuns;

      const perInnings = {};
      for (const ov of inn.oversData) {
        for (const b of ov.balls) {
          if (isLegal(b)) { t.ballsFor++; t.ballsFaced++; }
          t.extras += b.extras || 0;
          const r = batRuns(b);
          if (!b.extraType && r === 4) t.fours++;
          if (!b.extraType && r === 6) t.sixes++;
          const p = B(b.batterId, b.batter?.name);
          p.matches.add(m.id);
          (perInnings[b.batterId] ||= { runs: 0, balls: 0, ballsTo50: null, ballsTo100: null });
          if (ballFaced(b)) { p.balls++; perInnings[b.batterId].balls++; }
          p.runs += r; perInnings[b.batterId].runs += r;
          
          if (perInnings[b.batterId].runs >= 50 && perInnings[b.batterId].ballsTo50 === null) {
            perInnings[b.batterId].ballsTo50 = perInnings[b.batterId].balls;
          }
          if (perInnings[b.batterId].runs >= 100 && perInnings[b.batterId].ballsTo100 === null) {
            perInnings[b.batterId].ballsTo100 = perInnings[b.batterId].balls;
          }

          if (!b.extraType && r === 4) p.fours++;
          if (!b.extraType && r === 6) p.sixes++;
          if (b.isWicket && b.dismissedPlayerId) {
            const d = B(b.dismissedPlayerId, null);
            d.out++;
            if (perInnings[b.dismissedPlayerId]?.runs === 0 || (!perInnings[b.dismissedPlayerId] && d.runs === 0)) {
              d.ducks++;
            }
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
        
        if (s.ballsTo50 !== null && (p.fastest50 === null || s.ballsTo50 < p.fastest50)) p.fastest50 = s.ballsTo50;
        if (s.ballsTo100 !== null && (p.fastest100 === null || s.ballsTo100 < p.fastest100)) p.fastest100 = s.ballsTo100;
      }
    }

    // ── Our bowling innings ──
    for (const inn of theirs) {
      const perInnBowl = new Set();
      for (const ov of inn.oversData) {
        let maidenBowlerId = null;
        let overRuns = 0;
        let overLegal = 0;
        
        for (const b of ov.balls) {
          const bid = b.bowlerId || ov.bowlerId;
          if (!bid) continue;
          
          if (!maidenBowlerId) maidenBowlerId = bid;
          else if (maidenBowlerId !== bid) maidenBowlerId = 'SHARED';
          
          const p = W(bid, ov.bowler?.name);
          p.matches.add(m.id);
          perInnBowl.add(bid);
          if (isLegal(b)) {
            p.balls++;
            overLegal++;
            t.ballsBowled++;
          }
          const conceded = (b.runs || 0) + (['wide', 'noBall'].includes(b.extraType) ? (b.extras || 0) : 0);
          p.runs += conceded;
          overRuns += conceded;
          t.runsAgainst += conceded;
          
          if (isLegal(b) && conceded === 0 && !b.isWicket) p.dots++;
          if (bowlerWicket(b)) { p.wickets++; t.wicketsTaken++; }
          if (b.isWicket && b.wicketAssists) {
            const wt = String(b.wicketType || '').toLowerCase().replace(/[\s&]/g, '');
            if (wt === 'runout') {
              const assists = b.wicketAssists.split(',').map(s => s.trim());
              if (b.directHit && assists.length === 1) {
                 const f = F(assists[0]);
                 f.runOuts++;
                 f.directHits++;
              } else {
                 for (const a of assists) {
                   const f = F(a);
                   f.runOuts++;
                   f.assistedRunOuts++;
                 }
              }
            } else {
              const f = F(b.wicketAssists);
              if (wt === 'caught' || wt === 'caughtbowled' || wt === 'candb') f.catches++;
              else if (wt === 'stumped') f.stumpings++;
            }
          }
        }
        
        if (maidenBowlerId && maidenBowlerId !== 'SHARED' && overLegal >= 6 && overRuns === 0) {
          W(maidenBowlerId, ov.bowler?.name).maidens++;
        }
      }
      for (const bid of perInnBowl) {
        W(bid, null).innings++;
      }
    }

    const cap = allTeams ? null : m.squads.find((s) => s.teamId === teamId && s.isCaptain);
    if (cap && won) capWins[cap.playerId] = (capWins[cap.playerId] || 0) + 1;

    if (!allTeams && m.innings.length === 2 && !noResult && !tied) {
      const our = ours[0], their = theirs.find((i) => i.battingTeamId === opponentId);
      if (our && their) {
        if (our.inningNumber === 1) {
          const by = our.totalRuns - their.totalRuns;
          if (won) {
            if (by > 0 && (t.bestWinRuns === null || by > t.bestWinRuns)) t.bestWinRuns = by;
            if (by > 0 && (t.closestWinRuns === null || by < t.closestWinRuns)) t.closestWinRuns = by;
          } else {
            const byWickets = Math.max(0, Math.max(1, (m.squads.filter((s) => s.teamId === opponentId).length || 11) - 1) - their.totalWickets);
            if (t.biggestLossWickets === null || byWickets > t.biggestLossWickets) t.biggestLossWickets = byWickets;
          }
        } else {
          if (won) {
            const xi = m.squads.filter((s) => s.teamId === teamId).length || 11;
            const wicketsInHand = Math.max(0, Math.max(1, xi - 1) - our.totalWickets);
            if (t.bestWinWickets === null || wicketsInHand > t.bestWinWickets) t.bestWinWickets = wicketsInHand;
            if (t.closestWinWickets === null || wicketsInHand < t.closestWinWickets) t.closestWinWickets = wicketsInHand;
          } else {
            const by = their.totalRuns - our.totalRuns;
            if (by > 0 && (t.biggestLossRuns === null || by > t.biggestLossRuns)) t.biggestLossRuns = by;
          }
        }
      }
    }
  }

  for (const m of matches) {
    for (const inn of (allTeams ? m.innings : m.innings.filter((i) => i.bowlingTeamId === teamId))) {
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

  const streak = (want) => {
    let best = 0, run = 0;
    for (const r of results) { run = r === want ? run + 1 : 0; if (run > best) best = run; }
    return best;
  }
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
  const partList = Object.values(part).filter((p) => p.name);

  const battingRows = batList.map((p) => ({
    playerId: p.id, name: p.name, matches: p.matches.size, innings: p.innings,
    runs: p.runs, balls: p.balls, notOuts: Math.max(0, p.innings - p.out),
    average: p.out > 0 ? div(p.runs, p.out) : p.runs || 0,
    strikeRate: div(p.runs * 100, p.balls, 1),
    highest: p.best, fours: p.fours, sixes: p.sixes, fifties: p.fifties, hundreds: p.hundreds,
    ducks: p.ducks, fastest50: p.fastest50, fastest100: p.fastest100,
  }));
  const bowlingRows = bowlList.map((p) => ({
    playerId: p.id, name: p.name, matches: p.matches.size, innings: p.innings,
    balls: p.balls, overs: oversOf(p.balls), runs: p.runs, wickets: p.wickets,
    economy: p.balls > 0 ? div(p.runs * 6, p.balls) : 0,
    average: p.wickets > 0 ? div(p.runs, p.wickets) : 0,
    strikeRate: p.wickets > 0 ? div(p.balls, p.wickets, 1) : 0,
    best: p.bestW > 0 ? `${p.bestW}/${p.bestR}` : '—',
    bestW: p.bestW, bestR: p.bestR,
    threes: p.threes, fives: p.fives, dots: p.dots, maidens: p.maidens,
  }));
  // Fielding points, for the Green Cap. Fielding has no single number the way
  // batting has runs and bowling has wickets — six separate boards and no answer
  // to "who fields best", which is the question the cap asks. So one score.
  //
  // The weights say a direct hit is the hardest thing a fielder does (one throw,
  // no help, no second chance), a catch and a stumping are a clean piece of
  // skill each, and an assisted run-out is a share of one. They are deliberately
  // small whole numbers: a scheme nobody can read is a scheme nobody trusts, and
  // this one has to survive being disagreed with in a WhatsApp group.
  //
  // runOuts already counts directHits + assistedRunOuts, so scoring the two
  // parts and not the total is what keeps a run-out from being paid twice.
  const FIELD_POINTS = { catch: 2, stumping: 2, directHit: 3, assistedRunOut: 1 };
  const fieldingRows = Object.values(field).map((f) => ({
    name: f.name, catches: f.catches, runOuts: f.runOuts, stumpings: f.stumpings,
    directHits: f.directHits, assistedRunOuts: f.assistedRunOuts,
    dismissals: f.catches + f.runOuts + f.stumpings,
    points: f.catches * FIELD_POINTS.catch
          + f.stumpings * FIELD_POINTS.stumping
          + f.directHits * FIELD_POINTS.directHit
          + f.assistedRunOuts * FIELD_POINTS.assistedRunOut,
  }));
  // Faces. Every board renders an avatar and falls back to an initial, and the
  // fallback was all anyone ever saw because nothing here sent a photo. One
  // query for every player who appears on any board, rather than an include on
  // each of the three sources they come from.
  //
  // Fielding boards are keyed by NAME, not id — the scorer records a catcher as
  // a name on the ball — so those rows stay on their initials until that
  // changes. Better a consistent initial than a face guessed from a name.
  const facedIds = [...new Set([...battingRows, ...bowlingRows, ...partList.map((p) => ({ playerId: p.id }))]
    .map((r) => r.playerId).filter(Boolean))];
  const avatarOf = Object.fromEntries(
    (facedIds.length
      ? await prisma.player.findMany({
          where: { id: { in: facedIds } },
          select: { id: true, user: { select: { avatarUrl: true } } },
        })
      : []
    ).map((p) => [p.id, p.user?.avatarUrl || null]),
  );
  for (const r of [...battingRows, ...bowlingRows]) r.avatar = avatarOf[r.playerId] || null;

  const participationRows = partList.map((p) => {
    const b = bat[p.id];
    const w = bowl[p.id];
    return {
      playerId: p.id, name: p.name, matches: p.matches, avatar: avatarOf[p.id] || null,
      inningsBat: b ? b.innings : 0, ballsFaced: b ? b.balls : 0,
      inningsBowl: w ? w.innings : 0, oversBowl: w ? oversOf(w.balls) : '0.0',
    };
  });

  const teamBowling = bowlingRows.reduce((acc, b) => {
    acc.maidens += b.maidens || 0;
    acc.dots += b.dots || 0;
    return acc;
  }, { maidens: 0, dots: 0 });

  const teamFielding = fieldingRows.reduce((acc, f) => {
    acc.catches += f.catches || 0;
    acc.runOuts += f.runOuts || 0;
    acc.directHits += f.directHits || 0;
    acc.assistedRunOuts += f.assistedRunOuts || 0;
    acc.stumpings += f.stumpings || 0;
    acc.dismissals += f.dismissals || 0;
    return acc;
  }, { catches: 0, runOuts: 0, directHits: 0, assistedRunOuts: 0, stumpings: 0, dismissals: 0 });

  const minInnings = Math.max(2, Math.round(t.played * 0.25));
  const minOvers = Math.max(2, Math.round(t.played * 0.5));

  // Every board is a top ten. The helper was deleted while its twenty-odd call
  // sites below were left standing, so GET /teams/:id/stats threw "top is not
  // defined" on every request — which is why the Stats and Leaderboard tabs
  // showed nothing at all.
  const top = (arr, n = 10) => arr.slice(0, n);

  return {
    team: team ? { id: team.id, name: team.name, logoUrl: team.logoUrl } : null,
    filters,
    matchCount: matches.length,
    team_stats: {
      played: matches.length, won: t.won, lost: t.lost, tied: t.tied, noResult: t.noResult,
      winPct: div(t.won * 100, Math.max(1, matches.length - t.noResult), 1),
      highestScore: t.highest > 0 ? String(t.highest) : '—',
      lowestScore: t.lowest < Infinity ? String(t.lowest) : '—',
      bestChase: t.bestChase > 0 ? String(t.bestChase) : '—',
      lowestDefended: t.lowestDefended < Infinity ? String(t.lowestDefended) : '—',
      avgScore: div(t.runsFor, Math.max(1, t.inningsFor)),
      runRate: div(t.runsFor * 6, Math.max(1, t.ballsFor)),
      avgWicketsLost: div(t.wicketsLost, Math.max(1, t.inningsFor), 1),
      totalRuns: t.runsFor, totalWickets: t.wicketsTaken,
      totalRunsConceded: t.runsAgainst,
      teamEconomy: div(t.runsAgainst * 6, Math.max(1, t.ballsBowled)),
      teamBowlingAvg: div(t.runsAgainst, Math.max(1, t.wicketsTaken)),
      teamBowlingSr: div(t.ballsBowled, Math.max(1, t.wicketsTaken), 1),
      totalMaidens: teamBowling.maidens,
      totalDots: teamBowling.dots,
      fours: t.fours, sixes: t.sixes, boundaries: t.fours + t.sixes, extras: t.extras,
      bestWinRuns: t.bestWinRuns, bestWinWickets: t.bestWinWickets,
      closestWinRuns: t.closestWinRuns, closestWinWickets: t.closestWinWickets,
      biggestLossRuns: t.biggestLossRuns, biggestLossWickets: t.biggestLossWickets,
      longestWinStreak: streak('W'), longestLossStreak: streak('L'),
      currentStreak: current.count ? `${current.count}${current.kind}` : '—',
      homeWins: t.homeWins, homePlayed: t.homePlayed,
      awayWins: t.awayWins, awayPlayed: t.awayPlayed,
      neutralWins: t.won - t.homeWins - t.awayWins,
      tossWinPct: div(t.tossWon * 100, Math.max(1, t.tossKnown), 1),
      batFirstWins: t.batFirstWins, batFirstPlayed: t.batFirstPlayed,
      fieldFirstWins: t.fieldFirstWins, fieldFirstPlayed: t.fieldFirstPlayed,
      avgFirstInnings: div(t.firstInningsRuns, Math.max(1, t.firstInningsCount), 1),
      avgSecondInnings: div(t.secondInningsRuns, Math.max(1, t.secondInningsCount), 1),
      form: results.slice(-5),
      ...teamFielding
    },
    leaderboards: {
      runs:       top([...battingRows].sort((a, b) => b.runs - a.runs || b.average - a.average)),
      average:    top([...battingRows].filter((p) => p.innings >= minInnings).sort((a, b) => b.average - a.average)),
      strikeRate: top([...battingRows].filter((p) => p.innings >= minInnings && p.balls > 0).sort((a, b) => b.strikeRate - a.strikeRate)),
      highest:    top([...battingRows].filter((p) => p.highest > 0).sort((a, b) => b.highest - a.highest)),
      hundreds:   top([...battingRows].filter((p) => p.hundreds > 0).sort((a, b) => b.hundreds - a.hundreds)),
      fifties:    top([...battingRows].filter((p) => p.fifties > 0).sort((a, b) => b.fifties - a.fifties)),
      sixes:      top([...battingRows].filter((p) => p.sixes > 0).sort((a, b) => b.sixes - a.sixes)),
      fours:      top([...battingRows].filter((p) => p.fours > 0).sort((a, b) => b.fours - a.fours)),
      notOuts:    top([...battingRows].filter((p) => p.notOuts > 0).sort((a, b) => b.notOuts - a.notOuts)),
      ducks:      top([...battingRows].filter((p) => p.ducks > 0).sort((a, b) => b.ducks - a.ducks)),
      fastest50:  top([...battingRows].filter((p) => p.fastest50 !== null).sort((a, b) => a.fastest50 - b.fastest50)),
      fastest100: top([...battingRows].filter((p) => p.fastest100 !== null).sort((a, b) => a.fastest100 - b.fastest100)),
      
      wickets:    top([...bowlingRows].sort((a, b) => b.wickets - a.wickets || a.economy - b.economy)),
      bowlingAvg: top([...bowlingRows].filter((p) => p.wickets >= minInnings).sort((a, b) => a.average - b.average)),
      bestBowling: top([...bowlingRows].filter((p) => p.wickets > 0).sort((a, b) => b.bestW - a.bestW || a.bestR - b.bestR)),
      fives:      top([...bowlingRows].filter((p) => p.fives > 0).sort((a, b) => b.fives - a.fives)),
      threes:     top([...bowlingRows].filter((p) => p.threes > 0).sort((a, b) => b.threes - a.threes)),
      economy:    top([...bowlingRows].filter((p) => p.balls >= minOvers * 6).sort((a, b) => a.economy - b.economy)),
      bowlingSr:  top([...bowlingRows].filter((p) => p.wickets >= minInnings).sort((a, b) => a.strikeRate - b.strikeRate)),
      maidens:    top([...bowlingRows].filter((p) => p.maidens > 0).sort((a, b) => b.maidens - a.maidens)),
      dots:       top([...bowlingRows].filter((p) => p.dots > 0).sort((a, b) => b.dots - a.dots)),

      catches:    top([...fieldingRows].filter((f) => f.catches > 0).sort((a, b) => b.catches - a.catches)),
      runOuts:    top([...fieldingRows].filter((f) => f.runOuts > 0).sort((a, b) => b.runOuts - a.runOuts)),
      directHits: top([...fieldingRows].filter((f) => f.directHits > 0).sort((a, b) => b.directHits - a.directHits)),
      assistedRunOuts: top([...fieldingRows].filter((f) => f.assistedRunOuts > 0).sort((a, b) => b.assistedRunOuts - a.assistedRunOuts)),
      stumpings:  top([...fieldingRows].filter((f) => f.stumpings > 0).sort((a, b) => b.stumpings - a.stumpings)),
      dismissals: top([...fieldingRows].filter((f) => f.dismissals > 0).sort((a, b) => b.dismissals - a.dismissals)),
      // Ties break on dismissals, so the fielder who did more of it comes first
      // rather than whoever the object keys happened to order first.
      bestFielder: top([...fieldingRows].filter((f) => f.points > 0).sort((a, b) => b.points - a.points || b.dismissals - a.dismissals)),

      matches:    top([...participationRows].sort((a, b) => b.matches - a.matches)),
      inningsBat: top([...participationRows].filter((p) => p.inningsBat > 0).sort((a, b) => b.inningsBat - a.inningsBat)),
      inningsBowl: top([...participationRows].filter((p) => p.inningsBowl > 0).sort((a, b) => b.inningsBowl - a.inningsBowl)),
      oversBowl:  top([...participationRows].filter((p) => p.oversBowl !== '0.0').sort((a, b) => parseFloat(b.oversBowl) - parseFloat(a.oversBowl))),
      ballsFaced: top([...participationRows].filter((p) => p.ballsFaced > 0).sort((a, b) => b.ballsFaced - a.ballsFaced)),

      motm:       top(Object.values(motm).sort((a, b) => b.count - a.count)),
      appearances: top([...battingRows].sort((a, b) => b.matches - a.matches)),
      captainWins: top(Object.entries(capWins)
        .map(([id, wins]) => ({ playerId: id, name: bat[id]?.name || bowl[id]?.name || 'Captain', wins }))
        .sort((a, b) => b.wins - a.wins)),
    },
    qualification: { minInnings, minOvers },
  };
}

/**
 * A tournament's leaderboards: the same thirty-five boards, over every match
 * played as one of its fixtures, for every player who took part.
 *
 * No filters. A tournament is already a window — one competition, one season,
 * one set of teams — so a year picker would offer the year it was played in and
 * an opposition picker would offer everyone in it. The team boards need filters
 * because a club's history runs for years; a tournament's does not.
 */
export async function tournamentStats(tournamentId) {
  const fixtures = await prisma.tournamentMatch.findMany({
    where: { tournamentId, matchId: { not: null } },
    select: { matchId: true },
  });
  const matchIds = [...new Set(fixtures.map((f) => f.matchId))];
  return teamStats(null, { matchIds });
}

// The values the filter controls should offer — derived from this team's own
// matches, so a ground or a match type that never happened is never offered.
export async function teamStatsFilterOptions(teamId) {
  const matches = await prisma.match.findMany({
    where: { OR: [{ team1Id: teamId }, { team2Id: teamId }], status: 'completed' },
    // team1Id/team2Id are read further down to build the opposition list. They
    // were missing from this select, so every match reported both as undefined,
    // oppIds came out as [undefined], and Prisma refused the findMany — a 500
    // on every call. The screen degrades quietly when this fails (it just keeps
    // its empty defaults), so the filter sheet had no years, no formats and no
    // oppositions and looked merely empty rather than broken.
    select: { id: true, startTime: true, matchType: true, venue: true, team1Id: true, team2Id: true },
  });
  const years = [...new Set(matches.map((m) => m.startTime && new Date(m.startTime).getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  const matchTypes = [...new Set(matches.map((m) => m.matchType).filter(Boolean))].sort();
  // Venues are free text and typed by hand — this team has "Chennai", "CHENNAI"
  // and "chennai" as three separate grounds. Fold them so the filter offers one
  // entry, labelled with the spelling used most often.
  //
  // Grouped by venueKey() rather than a local toLowerCase(): new matches are
  // canonicalised on write now, and the day that rule changes this list has to
  // change with it rather than quietly disagreeing about what one ground is.
  const venueCounts = {};
  for (const m of matches) {
    const v = (m.venue || '').trim();
    if (!v) continue;
    const key = venueKey(v);
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

  // Belt and braces: a match with one side still unset is legal in the schema,
  // and a single null in this array takes the whole endpoint down again.
  const oppIds = [...new Set(matches.flatMap(m => [m.team1Id, m.team2Id]))].filter(id => id && id !== teamId);
  const oppTeams = await prisma.team.findMany({
    where: { id: { in: oppIds } },
    select: { id: true, name: true }
  });
  const oppositions = oppTeams.sort((a, b) => a.name.localeCompare(b.name));

  return { years, matchTypes, venues, tournaments, oppositions };
}
