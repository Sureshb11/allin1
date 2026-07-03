import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { computeStandings, persistStandings } from '../lib/standings.js';

const router = Router();

// ── Module 2: computed standings (points engine + per-sport tiebreakers) ─────
// Replaces the client-computed points table: this derives points + NRR/GD from
// recorded match results using the sport's SportConfiguration.standings rules.
router.get('/:id/standings', async (req, res) => {
  try {
    res.json({ standings: await computeStandings(req.params.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Report a tournament match result → records it, then recomputes the table.
// body: { tmId, winnerTeamId?|resultKind, stats: { [teamId]: {scored, conceded, oversFaced?, oversBowled?} } }
const ResultSchema = z.object({
  tmId:         z.string(),
  winnerTeamId: z.string().optional().nullable(),
  resultKind:   z.enum(['win', 'draw', 'tie', 'noResult']).default('win'),
  stats:        z.record(z.any()).optional(),
});
router.post('/:id/result', authMiddleware, async (req, res) => {
  try {
    const d = ResultSchema.parse(req.body);
    await prisma.tournamentMatch.update({
      where: { id: d.tmId },
      data: {
        status: 'completed',
        winnerTeamId: d.resultKind === 'win' ? d.winnerTeamId : null,
        resultKind: d.resultKind,
        resultStats: d.stats || {},
      },
    });
    const standings = await persistStandings(req.params.id);
    res.json({ success: true, standings });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Phases (League / Knockout / Series) ──────────────────────────────────────
router.get('/:id/phases', async (req, res) => {
  try {
    const phases = await prisma.tournamentPhase.findMany({
      where: { tournamentId: req.params.id }, orderBy: { order: 'asc' },
    });
    res.json({ phases });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PhaseSchema = z.object({
  type: z.enum(['league', 'knockout', 'series']),
  name: z.string().min(1),
  order: z.number().int().default(0),
  config: z.any().optional(),
});
router.post('/:id/phases', authMiddleware, async (req, res) => {
  try {
    const d = PhaseSchema.parse(req.body);
    const phase = await prisma.tournamentPhase.create({
      data: { tournamentId: req.params.id, ...d },
    });
    res.status(201).json({ phase });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Resolve a best-of-N series: winner = first to ceil(bestOf/2) leg wins.
router.get('/:id/series/:seriesId', async (req, res) => {
  try {
    const legs = await prisma.tournamentMatch.findMany({
      where: { tournamentId: req.params.id, seriesId: req.params.seriesId },
      orderBy: { leg: 'asc' },
      include: { phase: true },
    });
    const bestOf = legs[0]?.phase?.config?.bestOf || legs.length || 3;
    const need = Math.ceil(bestOf / 2);
    const wins = {};
    for (const l of legs) if (l.winnerTeamId) wins[l.winnerTeamId] = (wins[l.winnerTeamId] || 0) + 1;
    const decided = Object.entries(wins).find(([, w]) => w >= need);
    res.json({
      seriesId: req.params.seriesId, bestOf, need, wins,
      winnerTeamId: decided ? decided[0] : null,
      complete: !!decided,
      legs,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// Add fixture (optionally as a phase/series leg)
router.post('/:id/schedule', authMiddleware, async (req, res) => {
  try {
    const { team1Id, team2Id, scheduledAt, venue, round, phaseId, seriesId, leg } = req.body;
    const match = await prisma.tournamentMatch.create({
      data: {
        tournamentId: req.params.id,
        team1Id, team2Id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        venue, round,
        phaseId: phaseId || undefined,
        seriesId: seriesId || undefined,
        leg: leg != null ? Number(leg) : undefined,
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
  sport:       z.string().optional(),   // was dropped → every tournament saved as cricket
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
