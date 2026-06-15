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
  const players = await prisma.player.findMany({ where, include: { team: true }, take: 100 });
  res.json({ players });
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
