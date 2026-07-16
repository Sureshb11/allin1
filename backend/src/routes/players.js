import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

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
  const players = await prisma.player.findMany({ where, include: { team: true }, take: 500 });

  // Attach REAL cricket numbers computed from the scoring data, so the
  // Statistics leaderboard reflects actual matches instead of the static
  // stats JSON (which nothing updates). Cheap: batting from one Ball groupBy,
  // bowling from the per-over aggregates the scorer already maintains.
  const [batAgg, disAgg, bowlAgg, mpAgg, inningAgg, legalAgg] = await Promise.all([
    prisma.ball.groupBy({ by: ['batterId'], _sum: { runs: true }, _count: { _all: true } }),
    prisma.ball.groupBy({ by: ['dismissedPlayerId'], _count: { _all: true }, where: { dismissedPlayerId: { not: null } } }),
    prisma.over.groupBy({ by: ['bowlerId'], _sum: { runs: true, extras: true, wickets: true }, _count: { _all: true } }),
    prisma.matchPlayer.groupBy({ by: ['playerId'], _count: { _all: true } }),
    // Per-innings run totals → hundreds. The leaderboard has always shown a
    // "100s" column, but nothing computed it, so it read 0 for every player
    // forever. A century is per INNINGS, and groupBy can't reach through
    // Over → Inning, so group by over and fold overs into their innings below.
    prisma.ball.groupBy({ by: ['batterId', 'overId'], _sum: { runs: true } }),
    // Legal deliveries per over → real overs bowled. The economy below used to
    // divide by the NUMBER OF OVER ROWS, so a bowler who sent down 3 balls was
    // charged for a full over and their economy read better than it was (and
    // disagreed with the profile screen, which counts legal balls). Wides and
    // no-balls don't advance the over.
    prisma.ball.groupBy({
      by: ['overId'], _count: { _all: true },
      where: { OR: [{ extraType: null }, { extraType: { notIn: ['wide', 'noBall'] } }] },
    }),
  ]);

  // overId → inningId / bowlerId, so the per-over sums above can be folded into
  // knocks and into each bowler's real ball count.
  const overRows = await prisma.over.findMany({ select: { id: true, inningId: true, bowlerId: true } });
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

  const enriched = players.map((p) => {
    const b = bat[p.id], w = bowl[p.id];
    const computed = {};
    if (b) {
      const runs = b._sum.runs || 0, faced = b._count._all;
      const outs = dis[p.id] || 0;
      computed.runs = runs;
      computed.strikeRate = faced ? +(runs / faced * 100).toFixed(1) : 0;
      computed.average = outs ? +(runs / outs).toFixed(1) : runs;
      const scores = Object.values(knock[p.id] || {});
      computed.centuries     = scores.filter((r) => r >= 100).length;
      computed.halfCenturies = scores.filter((r) => r >= 50 && r < 100).length;
      computed.highestScore  = scores.length ? Math.max(...scores) : 0;
      // Innings batted + balls faced: the leaderboard needs these to qualify
      // rate stats, so one 185-run knock with a single dismissal can't top the
      // averages table over a full season.
      computed.innings   = scores.length;
      computed.ballsFaced = faced;
    }
    if (w) {
      const conceded = (w._sum.runs || 0) + (w._sum.extras || 0);
      const legal = legalBy[p.id] || 0;
      computed.wickets      = w._sum.wickets || 0;
      computed.runsConceded = conceded;
      computed.ballsBowled  = legal;
      computed.oversBowled  = `${Math.floor(legal / 6)}.${legal % 6}`;
      computed.economy      = legal ? +(conceded / (legal / 6)).toFixed(2) : 0;
    }
    if (mp[p.id]) computed.matches = mp[p.id];
    return { ...p, stats: { ...(p.stats || {}), ...computed } };
  });

  res.json({ players: enriched });
});

router.get('/:id', async (req, res) => {
  const player = await prisma.player.findUnique({ where: { id: req.params.id }, include: { team: true } });
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json({ player });
});

const PlayerSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  teamId: z.string().optional(),
  userId: z.string().optional(),   // link to an existing Local Legends user
  sport: z.string().optional(),
  stats: z.any().optional(),
});

router.post('/', async (req, res) => {
  try {
    const data = PlayerSchema.parse(req.body);
    const player = await prisma.player.create({ data });
    res.status(201).json({ player });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Player insights - computed from ball-by-ball data
router.get('/:id/insights', async (req, res) => {
  try {
    const playerId = req.params.id;
    const player = await prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Batting stats
    const battingBalls = await prisma.ball.findMany({ where: { batterId: playerId } });
    const totalRuns = battingBalls.reduce((sum, b) => sum + b.runs, 0);
    const ballsFaced = battingBalls.filter(b => !b.extraType || (b.extraType !== 'wide')).length;
    const dismissals = await prisma.ball.count({ where: { dismissedPlayerId: playerId, isWicket: true } });
    const fours = battingBalls.filter(b => b.runs === 4).length;
    const sixes = battingBalls.filter(b => b.runs === 6).length;
    const battingAverage = dismissals > 0 ? (totalRuns / dismissals).toFixed(2) : totalRuns > 0 ? totalRuns.toFixed(2) : '0.00';
    const strikeRate = ballsFaced > 0 ? ((totalRuns / ballsFaced) * 100).toFixed(2) : '0.00';

    // Bowling stats
    const overs = await prisma.over.findMany({ where: { bowlerId: playerId }, include: { balls: true } });
    const runsConceded = overs.reduce((sum, o) => sum + o.runs + o.extras, 0);
    const wicketsTaken = overs.reduce((sum, o) => sum + o.wickets, 0);
    const oversBowled = overs.length;
    const economy = oversBowled > 0 ? (runsConceded / oversBowled).toFixed(2) : '0.00';
    const bowlingAverage = wicketsTaken > 0 ? (runsConceded / wicketsTaken).toFixed(2) : '0.00';

    // Matches played
    const matchCount = await prisma.matchPlayer.count({ where: { playerId } });

    // Recent form (last 5 matches batting performance)
    let recentForm = 'N/A';
    let trend = 'stable';
    const strongPoints = [];
    const improvementAreas = [];
    const recommendations = [];

    if (totalRuns > 0) {
      if (parseFloat(strikeRate) > 120) strongPoints.push('Aggressive batting');
      if (parseFloat(battingAverage) > 30) strongPoints.push('Consistent run scorer');
      if (fours + sixes > 10) strongPoints.push('Good boundary hitting');
    }
    if (wicketsTaken > 0) {
      if (parseFloat(economy) < 6) strongPoints.push('Economical bowling');
      if (wicketsTaken > 5) strongPoints.push('Regular wicket taker');
    }
    if (strongPoints.length === 0) strongPoints.push(player.role || 'All-rounder');

    if (parseFloat(strikeRate) < 80 && ballsFaced > 10) improvementAreas.push('Strike rate needs improvement');
    if (parseFloat(economy) > 8 && oversBowled > 3) improvementAreas.push('Economy rate too high');
    if (matchCount < 3) improvementAreas.push('Needs more match experience');

    if (matchCount >= 3) {
      recentForm = parseFloat(battingAverage) > 25 ? 'Good' : 'Average';
      trend = parseFloat(strikeRate) > 100 ? 'upward' : 'stable';
    }

    if (improvementAreas.length > 0) recommendations.push('Focus on ' + improvementAreas[0].toLowerCase());
    if (matchCount < 5) recommendations.push('Play more matches to build consistency');
    if (strongPoints.length > 0) recommendations.push('Continue leveraging ' + strongPoints[0].toLowerCase());

    res.json({
      insights: {
        performance: { recentForm, trend, strongPoints, improvementAreas },
        statistics: {
          matches: matchCount,
          totalRuns,
          ballsFaced,
          fours,
          sixes,
          battingAverage,
          strikeRate,
          oversBowled,
          runsConceded,
          wicketsTaken,
          economy,
          bowlingAverage,
        },
        recommendations,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
