import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { isTeamAdmin } from '../lib/teamAuth.js';
import { playerCareer } from '../lib/playerCareer.js';
import { canonicalRole } from '../lib/squadOrder.js';

// Store the app's spelling of a role, not whoever's.
//
// Player.role is free text and this database held ten spellings of five cricket
// roles across 278 players — Bat, Batsman, Bowl, Bowler, All Rounder,
// allrounder, Wicket Keeper — because a text box sat under the role chips for
// years. The box is gone, and 195 rows have been folded back to the four names
// the app offers; this is what stops it happening again, including from an app
// version older than that fix.
//
// Deliberately non-destructive. It only rewrites a spelling it RECOGNISES:
// canonicalRole returns null for "Player", for blanks, and for every non-cricket
// sport, and in all those cases the value is stored exactly as sent. So it can
// fold "Bat" to "Batter" and can never blank a role or rename a footballer's.
const foldRole = (role, sport) => canonicalRole(role, sport || 'cricket') || role;

const router = Router();

// Player.stats is a free-form Json column and POST /players accepts whatever a
// client sends (stats: z.any()), so personal details ended up living in it —
// 14 players on production carry a `phone` key. The app used to render every
// numeric-looking entry as a stat card, which put phone numbers on a screen
// anyone could open. That's fixed in the app, but the API was still handing the
// data out to any caller, so it's stripped at both ends here: on the way in so
// it stops accumulating, and on the way out so what's already stored stays put.
const PII_KEYS = ['phone', 'phoneNumber', 'mobile', 'email', 'contact', 'contactInfo', 'address', 'dob', 'password'];
const stripPII = (stats) => {
  if (!stats || typeof stats !== 'object') return stats;
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    if (!PII_KEYS.includes(k)) out[k] = v;
  }
  return out;
};


// Career numbers computed from the ball-by-ball record, shared by the list and
// the single-player route.
//
// This lived only inside GET /players. GET /players/:id returned the raw Prisma
// row, whose `stats` JSON is empty for anyone whose numbers are derived — so
// Player Insights, which fetches by id, showed a blank Career grid and a
// Fielding panel reading 0 catches for a player the leaderboard listed with
// catches. Same input, two answers, because only one route did the work.
async function aggregateStats(whereMatch, overRows) {
  const [batAgg, catchAgg, runOutAgg, disAgg, bowlAgg, mpAgg, inningAgg, legalAgg] = await Promise.all([
    prisma.ball.groupBy({ by: ['batterId'], _sum: { runs: true }, _count: { _all: true }, where: whereMatch ? { over: { inning: { match: whereMatch } } } : undefined }),
    prisma.ball.groupBy({
      by: ['wicketAssists'], _count: { _all: true },
      where: { isWicket: true, wicketType: 'caught', wicketAssists: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
    prisma.ball.groupBy({
      by: ['wicketAssists'], _count: { _all: true },
      where: { isWicket: true, wicketType: 'runout', wicketAssists: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
    prisma.ball.groupBy({ by: ['dismissedPlayerId'], _count: { _all: true }, where: { dismissedPlayerId: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) } }),
    prisma.over.groupBy({ by: ['bowlerId'], _sum: { runs: true, extras: true, wickets: true }, _count: { _all: true }, where: whereMatch ? { inning: { match: whereMatch } } : undefined }),
    prisma.matchPlayer.groupBy({ by: ['playerId'], _count: { _all: true }, where: whereMatch ? { match: whereMatch } : undefined }),
    prisma.ball.groupBy({ by: ['batterId', 'overId'], _sum: { runs: true }, where: whereMatch ? { over: { inning: { match: whereMatch } } } : undefined }),
    prisma.ball.groupBy({
      by: ['overId'], _count: { _all: true },
      where: { OR: [{ extraType: null }, { extraType: { notIn: ['wide', 'noBall', 'penalty', 'retired'] } }], ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
  ]);

  const inningOf = Object.fromEntries(overRows.map((o) => [o.id, o.inningId]));
  const bowlerOf = Object.fromEntries(overRows.map((o) => [o.id, o.bowlerId]));
  const legalBy = {};                     // bowlerId → legal balls bowled
  for (const g of legalAgg) {
    const bid = bowlerOf[g.overId];
    if (!bid) continue;
    legalBy[bid] = (legalBy[bid] || 0) + g._count._all;
  }
  const knock = {};                       // batterId → { inningId → runs }
  for (const g of inningAgg) {
    const inn = inningOf[g.overId];
    if (!inn) continue;
    (knock[g.batterId] = knock[g.batterId] || {});
    knock[g.batterId][inn] = (knock[g.batterId][inn] || 0) + (g._sum.runs || 0);
  }
  const bat  = Object.fromEntries(batAgg.map((a) => [a.batterId, a]));
  const dis  = Object.fromEntries(disAgg.map((a) => [a.dismissedPlayerId, a._count._all]));
  const bowl = Object.fromEntries(bowlAgg.map((a) => [a.bowlerId, a]));
  const mp   = Object.fromEntries(mpAgg.map((a) => [a.playerId, a._count._all]));
  const byName = (rows) => {
    const out = {};
    for (const r of rows) {
      const key = (r.wicketAssists || '').trim();
      if (key) out[key] = (out[key] || 0) + r._count._all;
    }
    return out;
  };
  const catches = byName(catchAgg);
  const runOuts = byName(runOutAgg);

  const getPlayerComputed = (pId, pName) => {
    const b = bat[pId], w = bowl[pId];
    const computed = {};
    if (b) {
      const runs = b._sum.runs || 0, faced = b._count._all;
      const outs = dis[pId] || 0;
      computed.runs = runs;
      computed.strikeRate = faced ? +(runs / faced * 100).toFixed(1) : 0;
      computed.average = outs ? +(runs / outs).toFixed(1) : runs;
      const scores = Object.values(knock[pId] || {});
      computed.centuries     = scores.filter((r) => r >= 100).length;
      computed.halfCenturies = scores.filter((r) => r >= 50 && r < 100).length;
      computed.highestScore  = scores.length ? Math.max(...scores) : 0;
      computed.innings   = scores.length;
      computed.battingInnings = scores.length;
      computed.ballsFaced = faced;
      computed.outs = outs;
    }
    if (w) {
      const conceded = (w._sum.runs || 0) + (w._sum.extras || 0);
      const legal = legalBy[pId] || 0;
      computed.wickets      = w._sum.wickets || 0;
      computed.runsConceded = conceded;
      computed.ballsBowled  = legal;
      computed.oversBowled  = `${Math.floor(legal / 6)}.${legal % 6}`;
      computed.economy      = legal ? +(conceded / (legal / 6)).toFixed(2) : 0;
      computed.bowlingInnings = w._sum.wickets !== null || legal > 0 ? 1 : 0;
    }
    const nm = (pName || '').trim();
    computed.catches = catches[nm] || 0;
    computed.runOuts = runOuts[nm] || 0;
    if (mp[pId]) computed.matches = mp[pId];
    return computed;
  };
  
  return getPlayerComputed;
}

function mergeStats(baseline = {}, computed = {}) {
  const aggregated = {};
  const add = (key) => (Number(baseline[key]) || 0) + (computed[key] || 0);
  
  aggregated.runs = add('runs');
  aggregated.matches = add('matches');
  aggregated.innings = add('innings'); 
  aggregated.battingInnings = add('battingInnings') || add('innings'); 
  aggregated.bowlingInnings = add('bowlingInnings');
  aggregated.ballsFaced = add('ballsFaced');
  aggregated.fours = add('fours');
  aggregated.sixes = add('sixes');
  aggregated.centuries = add('centuries');
  aggregated.halfCenturies = add('halfCenturies');
  aggregated.highestScore = Math.max(Number(baseline.highestScore) || 0, computed.highestScore || 0);
  
  aggregated.wickets = add('wickets');
  aggregated.runsConceded = add('runsConceded');
  aggregated.ballsBowled = add('ballsBowled');
  aggregated.catches = add('catches');
  aggregated.runOuts = add('runOuts');

  const totalOuts = (Number(baseline.outs) || 0) + (computed.outs || 0);
  aggregated.average = totalOuts ? +(aggregated.runs / totalOuts).toFixed(1) : aggregated.runs;
  aggregated.strikeRate = aggregated.ballsFaced ? +(aggregated.runs / aggregated.ballsFaced * 100).toFixed(1) : Number(baseline.strikeRate) || 0;
  
  aggregated.oversBowled = `${Math.floor(aggregated.ballsBowled / 6)}.${aggregated.ballsBowled % 6}`;
  aggregated.economy = aggregated.ballsBowled ? +(aggregated.runsConceded / (aggregated.ballsBowled / 6)).toFixed(2) : Number(baseline.economy) || 0;

  return { ...baseline, ...computed, ...aggregated };
}

async function enrichPlayers(players) {
  const overRows = await prisma.over.findMany({ select: { id: true, inningId: true, bowlerId: true } });
  
  const getOverall = await aggregateStats(null, overRows);
  const getLeather = await aggregateStats({ ballType: 'leather' }, overRows);
  const getTennis = await aggregateStats({ ballType: 'tennis' }, overRows);
  const getIndoor = await aggregateStats({ ballType: 'indoor' }, overRows);

  const enriched = players.map((p) => {
    const baseline = p.stats || {};
    const overallComputed = getOverall(p.id, p.name);
    const leatherComputed = getLeather(p.id, p.name);
    const tennisComputed = getTennis(p.id, p.name);
    const indoorComputed = getIndoor(p.id, p.name);

    const mergedOverall = mergeStats(baseline, overallComputed);
    const mergedLeather = mergeStats(baseline.leather || {}, leatherComputed);
    const mergedTennis = mergeStats(baseline.tennis || {}, tennisComputed);
    const mergedIndoor = mergeStats(baseline.indoor || {}, indoorComputed);

    mergedOverall.leather = mergedLeather;
    mergedOverall.tennis = mergedTennis;
    mergedOverall.indoor = mergedIndoor;

    return { ...p, stats: stripPII(mergedOverall) };
  });

  return enriched;
}

router.get('/', async (req, res) => {
  // Optional filters: ?sport=cricket  ?teamId=...  ?userId=...
  const { sport, teamId, userId } = req.query;
  const where = {};
  if (sport) where.sport = String(sport);
  if (teamId) where.teamId = String(teamId);
  if (userId) where.userId = String(userId);
  // take: 100 used to silently truncate the Rankings leaderboard — the 101st
  // player simply didn't exist. 500 is still a guard against an unbounded scan
  // but is far past the point where a local league's board stays honest.
  // The linked user carries the photo — Player has no avatar column of its own,
  // so every leaderboard face was an initial in a circle even for players whose
  // account has one.
  const players = await prisma.player.findMany({
    where,
    include: { team: true, user: { select: { id: true, avatarUrl: true } } },
    take: 500,
  });

  const enriched = await enrichPlayers(players);

  res.json({ players: enriched });
});

// GET /players/leaderboard?sport=football — per-sport player rankings.
//
// Cricket ranks on its ball-by-ball derived stats (runs, wickets, economy).
// Every other sport records SportEvents, so ranking is just each player's
// events tallied by type. Returned raw so the app can rank on whichever metric
// that sport cares about (goals, cards, points…) without a backend change.
//
// NOTE: must stay above GET /:id, or Express matches "leaderboard" as an id.
router.get('/leaderboard', async (req, res) => {
  try {
    const sport = String(req.query.sport || '');
    if (!sport) return res.status(400).json({ error: 'sport is required' });

    const players = await prisma.player.findMany({
      where: { sport },
      // Same reason as the list above: the face lives on the linked user.
      select: {
        id: true, name: true, teamId: true,
        team: { select: { name: true } },
        user: { select: { id: true, avatarUrl: true } },
      },
    });
    if (!players.length) return res.json({ players: [] });

    const events = await prisma.sportEvent.findMany({
      where: { sport, playerId: { in: players.map((p) => p.id) } },
      select: { playerId: true, eventType: true, matchId: true },
    });

    const tally = {};
    for (const e of events) {
      const t = (tally[e.playerId] ||= { totals: {}, matches: new Set() });
      t.totals[e.eventType] = (t.totals[e.eventType] || 0) + 1;
      t.matches.add(e.matchId);
    }

    res.json({
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        teamName: p.team?.name || null,
        matches: tally[p.id]?.matches.size || 0,
        eventTotals: tally[p.id]?.totals || {},
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.id },
    // The linked account carries the photo, same as the list route.
    include: { team: true, user: { select: { id: true, avatarUrl: true } } },
  });
  if (!player) return res.status(404).json({ error: 'Player not found' });
  // Through the same enrichment the list uses, so a player's numbers can't
  // differ depending on which endpoint asked. This route used to hand back the
  // raw stats JSON — empty for anyone whose figures are derived from balls.
  const [enriched] = await enrichPlayers([player]);
  res.json({ player: enriched });
});

// One player's full career, in the exact shape GET /users/me/stats returns.
// Tapping a player in Rankings opens the same board of numbers as My Stats, so
// it has to be the same computation — see lib/playerCareer.js for the three
// disagreeing implementations this replaced.
router.get('/:id/career', async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: { team: true, user: { select: { id: true, avatarUrl: true } } },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const career = await playerCareer(player);
    res.json({
      ...career,
      // The header this feeds draws a face and a name, which the career itself
      // knows nothing about.
      player: { id: player.id, name: player.name, role: player.role, avatarUrl: player.user?.avatarUrl || null },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PlayerSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  teamId: z.string().optional(),
  userId: z.string().optional(),   // link to an existing Local Legends user
  sport: z.string().optional(),
  stats: z.any().optional(),
  // How they bat and bowl. Bowling style is genuinely optional — plenty of
  // cricketers never bowl — and "None" is a real answer, not an absent one.
  battingStyle: z.string().max(40).optional().nullable(),
  bowlingStyle: z.string().max(40).optional().nullable(),
});

router.post('/', async (req, res) => {
  try {
    const data = PlayerSchema.parse(req.body);
    if (data.stats) data.stats = stripPII(data.stats);
    data.role = foldRole(data.role, data.sport);
    // Prevent duplicates on the same team: a linked app user can only appear once,
    // and a guest can't be added twice under the exact same name.
    if (data.teamId) {
      const dupe = await prisma.player.findFirst({
        where: data.userId
          ? { teamId: data.teamId, userId: data.userId }             // same linked account
          : { teamId: data.teamId, name: { equals: data.name, mode: 'insensitive' } }, // guest can't shadow any existing member
        select: { id: true },
      });
      if (dupe) {
        return res.status(409).json({ error: `${data.name} is already in this team.` });
      }
    }
    const player = await prisma.player.create({ data });
    res.status(201).json({ player });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Edit a squad member's details — role, shirt number and captaincy. Team admins
// only. Captain / vice-captain are singular per team, so setting one clears it
// from every other member on the same team.
const EditPlayerSchema = z.object({
  role: z.string().min(1).optional(),
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
  isCaptain: z.boolean().optional(),
  isViceCaptain: z.boolean().optional(),
  battingStyle: z.string().max(40).optional().nullable(),
  bowlingStyle: z.string().max(40).optional().nullable(),
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.teamId && !(await isTeamAdmin(player.teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can edit members' });
    }
    const data = EditPlayerSchema.parse(req.body);
    if (data.stats) data.stats = stripPII(data.stats);
    // The player's own sport, not the caller's word for it.
    if (data.role) data.role = foldRole(data.role, player.sport);

    // A shirt number belongs to one player in a squad. Two number 7s make a
    // scorecard ambiguous and a squad list sort arbitrarily, and nothing was
    // stopping it. Null clears the number, which is always allowed.
    if (data.jerseyNumber != null && player.teamId) {
      const clash = await prisma.player.findFirst({
        where: { teamId: player.teamId, jerseyNumber: data.jerseyNumber, NOT: { id: player.id } },
        select: { name: true },
      });
      if (clash) {
        return res.status(409).json({ error: `${clash.name} already wears ${data.jerseyNumber}.` });
      }
    }

    const ops = [];
    // A captain / vice-captain is unique per team — demote the current holder first.
    if (data.isCaptain === true && player.teamId) {
      ops.push(prisma.player.updateMany({
        where: { teamId: player.teamId, isCaptain: true, NOT: { id: player.id } },
        data: { isCaptain: false },
      }));
    }
    if (data.isViceCaptain === true && player.teamId) {
      ops.push(prisma.player.updateMany({
        where: { teamId: player.teamId, isViceCaptain: true, NOT: { id: player.id } },
        data: { isViceCaptain: false },
      }));
    }
    ops.push(prisma.player.update({ where: { id: player.id }, data }));
    const [updated] = (await prisma.$transaction(ops)).slice(-1);
    res.json({ player: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a player from their team's squad. Any team admin (owner or promoted
// member) may do this. The player is detached (teamId → null) rather than
// hard-deleted, so any match/scoring history that references them stays intact.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id }, include: { team: true },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.teamId && !(await isTeamAdmin(player.teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can remove members' });
    }
    await prisma.player.update({ where: { id: req.params.id }, data: { teamId: null, isAdmin: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Player insights — the qualitative read on a career: what they're good at,
// what to work on, what to do next.
//
// The numbers behind it come from lib/playerCareer.js, the same computation the
// career board draws. They used to be worked out here, a third time, and more
// crudely: oversBowled counted Over ROWS (a two-ball over was a whole over, so
// economy was runs ÷ overs-started), fours counted byes, and runs conceded came
// off the Over aggregate with byes included. So this screen could tell a player
// their economy was fine while the scorecard and My Stats both said otherwise.
router.get('/:id/insights', async (req, res) => {
  try {
    const playerId = req.params.id;
    const player = await prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const { stats } = await playerCareer(player);
    const num = (v) => (v == null ? 0 : Number(v) || 0);
    const totalRuns    = num(stats.runs);
    const ballsFaced   = num(stats.ballsFaced);
    const strikeRate   = num(stats.strikeRate);
    const battingAvg   = num(stats.average);
    const boundaries   = num(stats.fours) + num(stats.sixes);
    const wicketsTaken = num(stats.wickets);
    const economy      = num(stats.economy);
    const ballsBowled  = num(stats.ballsBowled);
    const matchCount   = num(stats.matches);

    let recentForm = 'N/A';
    let trend = 'stable';
    const strongPoints = [];
    const improvementAreas = [];
    const recommendations = [];

    if (totalRuns > 0) {
      if (strikeRate > 120) strongPoints.push('Aggressive batting');
      if (battingAvg > 30) strongPoints.push('Consistent run scorer');
      if (boundaries > 10) strongPoints.push('Good boundary hitting');
    }
    if (wicketsTaken > 0) {
      if (economy < 6) strongPoints.push('Economical bowling');
      if (wicketsTaken > 5) strongPoints.push('Regular wicket taker');
    }
    // Dots are pressure, and the ledger now counts them properly.
    if (ballsBowled >= 12 && num(stats.dotBalls) / ballsBowled > 0.4) strongPoints.push('Builds pressure with dots');
    if (strongPoints.length === 0) strongPoints.push(player.role || 'All-rounder');

    if (strikeRate < 80 && ballsFaced > 10) improvementAreas.push('Strike rate needs improvement');
    // 3 overs, in balls — the old test compared against a count of Over rows.
    if (economy > 8 && ballsBowled > 18) improvementAreas.push('Economy rate too high');
    if (num(stats.sixesConceded) > 5) improvementAreas.push('Going for too many sixes');
    if (matchCount < 3) improvementAreas.push('Needs more match experience');

    if (matchCount >= 3) {
      recentForm = battingAvg > 25 ? 'Good' : 'Average';
      trend = strikeRate > 100 ? 'upward' : 'stable';
    }

    if (improvementAreas.length > 0) recommendations.push('Focus on ' + improvementAreas[0].toLowerCase());
    if (matchCount < 5) recommendations.push('Play more matches to build consistency');
    if (strongPoints.length > 0) recommendations.push('Continue leveraging ' + strongPoints[0].toLowerCase());

    res.json({
      insights: {
        performance: { recentForm, trend, strongPoints, improvementAreas },
        // The full career rides along, so a caller needing numbers uses the same
        // ones rather than a second, differently-computed set.
        statistics: {
          ...stats,
          // Legacy aliases. This payload used to name these three differently,
          // and an installed app is still asking for them by the old names —
          // dropping them turned Runs, Average, Wickets and Bowling Avg into
          // dashes on every phone that hadn't updated yet. Cheap to keep; an
          // API doesn't get to assume its clients were all replaced at once.
          totalRuns:      stats.runs ?? 0,
          wicketsTaken:   stats.wickets ?? 0,
          battingAverage: stats.average ?? 0,
        },
        recommendations,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
