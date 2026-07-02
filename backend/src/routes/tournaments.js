import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { sport, status } = req.query;
  const where = {};
  if (sport) where.sport = String(sport);
  if (status) where.status = String(status);
  const tournaments = await prisma.tournament.findMany({
    where,
    include: { teams: { include: { team: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ tournaments });
});

router.get('/:id', async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      teams:   { include: { team: true }, orderBy: { points: 'desc' } },
      matches: { orderBy: { scheduledAt: 'asc' } },
    },
  });
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  res.json({ tournament });
});

// Points table
router.get('/:id/points-table', async (req, res) => {
  try {
    const rows = await prisma.tournamentTeam.findMany({
      where: { tournamentId: req.params.id },
      include: { team: true },
      orderBy: [{ points: 'desc' }, { nrr: 'desc' }],
    });
    res.json({ pointsTable: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Schedule / Fixtures
router.get('/:id/schedule', async (req, res) => {
  try {
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: req.params.id },
      orderBy: { scheduledAt: 'asc' },
    });
    const enriched = await Promise.all(
      matches.map(async m => {
        const [team1, team2] = await Promise.all([
          prisma.team.findUnique({ where: { id: m.team1Id } }),
          prisma.team.findUnique({ where: { id: m.team2Id } }),
        ]);
        return { ...m, team1, team2 };
      })
    );
    res.json({ schedule: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Register a team in the tournament
router.post('/:id/teams', authMiddleware, async (req, res) => {
  try {
    const { teamId, group = 'A' } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: req.params.id, teamId, group },
      include: { team: true },
    });
    res.status(201).json({ entry });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Team already registered' });
    res.status(400).json({ error: e.message });
  }
});

// Add fixture
router.post('/:id/schedule', authMiddleware, async (req, res) => {
  try {
    const { team1Id, team2Id, scheduledAt, venue, round } = req.body;
    const match = await prisma.tournamentMatch.create({
      data: {
        tournamentId: req.params.id,
        team1Id, team2Id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        venue, round,
      },
    });
    res.status(201).json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update points row after a match result
router.put('/:id/points-table/:teamId', authMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const row = await prisma.tournamentTeam.update({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId: req.params.teamId } },
      data,
      include: { team: true },
    });
    res.json({ row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const TournamentSchema = z.object({
  name:        z.string().min(1),
  format:      z.string().min(1),
  overs:       z.number().int().optional(),
  ballType:    z.string().optional(),
  status:      z.string().min(1),
  startDate:   z.string().datetime().optional(),
  endDate:     z.string().datetime().optional(),
  venue:       z.string().optional(),
  maxTeams:    z.number().int().optional(),
  prizePool:   z.string().optional(),
  description: z.string().optional(),
  organizer:   z.string().optional(),
});

router.post('/', async (req, res) => {
  try {
    const data = TournamentSchema.parse(req.body);
    const t = await prisma.tournament.create({ data });
    res.status(201).json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update a tournament (whitelisted fields) — powers the "Start" button
// (upcoming → ongoing) and completing/rescheduling from the app.
router.put('/:id', async (req, res) => {
  try {
    const { status, startDate, endDate, venue, prizePool, maxTeams } = req.body;
    const t = await prisma.tournament.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(venue !== undefined && { venue }),
        ...(prizePool !== undefined && { prizePool }),
        ...(maxTeams !== undefined && { maxTeams }),
      },
    });
    res.json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
