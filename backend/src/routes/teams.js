import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const teams = await prisma.team.findMany({ include: { players: true } });
  res.json({ teams });
});

router.get('/:id', async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: { players: true } });
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json({ team });
});

const TeamSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  logoUrl: z.string().url().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  homeGround: z.string().optional(),
  colors: z.string().optional(),
  bio: z.string().optional(),
  achievements: z.string().optional(),
  foundedYear: z.number().int().optional(),
});

router.post('/', async (req, res) => {
  try {
    const data = TeamSchema.parse(req.body);
    const team = await prisma.team.create({ data });
    res.status(201).json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = TeamSchema.partial().parse(req.body);
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Team insights — form, top performers
router.get('/:id/insights', async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Last 5 completed matches
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ team1Id: teamId }, { team2Id: teamId }],
        status: 'completed',
      },
      include: { team1: true, team2: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const form = recentMatches.map(m => {
      const won = m.result && m.result.toLowerCase().includes(team.name.toLowerCase());
      return { matchId: m.id, opponent: m.team1Id === teamId ? m.team2 : m.team1, result: won ? 'W' : 'L', score1: m.score1, score2: m.score2 };
    });

    // Top batters from innings where this team batted
    const battingInnings = await prisma.inning.findMany({
      where: { battingTeamId: teamId },
      include: {
        oversData: {
          include: { balls: { include: { batter: true } } },
        },
      },
    });

    const batterMap = {};
    for (const inning of battingInnings) {
      for (const over of inning.oversData) {
        for (const ball of over.balls) {
          const id = ball.batterId;
          if (!batterMap[id]) batterMap[id] = { player: ball.batter, runs: 0, balls: 0, innings: new Set() };
          batterMap[id].innings.add(inning.id);
          if (!ball.extraType || ['legbye', 'bye'].includes(ball.extraType)) {
            batterMap[id].runs += ball.runs;
            batterMap[id].balls++;
          }
        }
      }
    }
    const topBatters = Object.values(batterMap)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5)
      .map(b => ({ player: b.player, runs: b.runs, innings: b.innings.size, average: b.innings.size > 0 ? +(b.runs / b.innings.size).toFixed(2) : 0 }));

    // Top bowlers from innings where this team bowled
    const bowlingInnings = await prisma.inning.findMany({
      where: { bowlingTeamId: teamId },
      include: {
        oversData: { include: { bowler: true } },
      },
    });

    const bowlerMap = {};
    for (const inning of bowlingInnings) {
      for (const over of inning.oversData) {
        const id = over.bowlerId;
        if (!bowlerMap[id]) bowlerMap[id] = { player: over.bowler, overs: 0, runs: 0, wickets: 0 };
        bowlerMap[id].overs++;
        bowlerMap[id].runs += over.runs + over.extras;
        bowlerMap[id].wickets += over.wickets;
      }
    }
    const topBowlers = Object.values(bowlerMap)
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
      .slice(0, 5)
      .map(b => ({ ...b, economy: b.overs > 0 ? +(b.runs / b.overs).toFixed(2) : 0 }));

    // Win/loss record
    const allMatches = await prisma.match.findMany({
      where: { OR: [{ team1Id: teamId }, { team2Id: teamId }], status: 'completed' },
      select: { result: true },
    });
    const wins = allMatches.filter(m => m.result && m.result.toLowerCase().includes(team.name.toLowerCase())).length;

    res.json({
      team,
      stats: { played: allMatches.length, won: wins, lost: allMatches.length - wins, winRate: allMatches.length > 0 ? +((wins / allMatches.length) * 100).toFixed(1) : 0 },
      form,
      topBatters,
      topBowlers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
