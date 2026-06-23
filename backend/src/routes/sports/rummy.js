import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// Resolve an optional Bearer token → userId (games are scoped per user when logged in).
async function userIdFrom(req) {
  const hdr = req.headers.authorization || '';
  if (hdr.startsWith('Bearer ')) {
    try {
      const { default: jwt } = await import('jsonwebtoken');
      return jwt.verify(hdr.slice(7), process.env.JWT_SECRET).sub;
    } catch { /* guest */ }
  }
  return null;
}

// Compute totals / eliminations / winner from the rounds.
function withState(game) {
  const limit = game.totalScore;
  const totalsByPlayer = {};
  for (const p of game.players) totalsByPlayer[p.id] = 0;
  for (const r of game.rounds) for (const sc of r.scores) {
    totalsByPlayer[sc.playerId] = (totalsByPlayer[sc.playerId] || 0) + sc.value;
  }
  const players = game.players
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ id: p.id, name: p.name, position: p.position, total: totalsByPlayer[p.id] || 0, eliminated: (totalsByPlayer[p.id] || 0) > limit }));
  const alive = players.filter((p) => !p.eliminated);
  const winner = alive.length === 1 && game.rounds.length > 0 ? alive[0] : null;
  const rounds = game.rounds
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({ id: r.id, roundNumber: r.roundNumber, scores: Object.fromEntries(r.scores.map((s) => [s.playerId, s.value])) }));
  return {
    id: game.id, name: game.name, status: winner ? 'completed' : game.status,
    totalScore: game.totalScore, openDrop: game.openDrop, middleDrop: game.middleDrop,
    fullCount: game.fullCount, adjustReentry: game.adjustReentry, createdAt: game.createdAt,
    roundsCompleted: game.rounds.length, players, rounds, winner,
  };
}

const fullInclude = { players: true, rounds: { include: { scores: true } } };

// ── Create a game ──────────────────────────────────────────────
const CreateSchema = z.object({
  name: z.string().optional(),
  totalScore: z.number().int().default(250),
  openDrop: z.number().int().default(25),
  middleDrop: z.number().int().default(50),
  fullCount: z.number().int().default(80),
  adjustReentry: z.boolean().default(false),
  players: z.array(z.string().min(1)).min(2),
});

router.post('/games', async (req, res) => {
  try {
    const d = CreateSchema.parse(req.body);
    const userId = await userIdFrom(req);
    const name = d.name?.trim() || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' - Pool Rummy';
    const game = await prisma.rummyGame.create({
      data: {
        userId, name, totalScore: d.totalScore, openDrop: d.openDrop, middleDrop: d.middleDrop,
        fullCount: d.fullCount, adjustReentry: d.adjustReentry,
        players: { create: d.players.map((nm, i) => ({ name: nm, position: i })) },
      },
      include: fullInclude,
    });
    res.status(201).json({ game: withState(game) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── List games (Continue Game) ─────────────────────────────────
router.get('/games', async (req, res) => {
  const userId = await userIdFrom(req);
  const where = userId ? { userId } : {};
  if (req.query.status) where.status = String(req.query.status);
  const games = await prisma.rummyGame.findMany({ where, include: fullInclude, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ games: games.map(withState) });
});

// ── Game detail ────────────────────────────────────────────────
router.get('/games/:id', async (req, res) => {
  const game = await prisma.rummyGame.findUnique({ where: { id: req.params.id }, include: fullInclude });
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ game: withState(game) });
});

// ── Add a round (enter scores) ─────────────────────────────────
const RoundSchema = z.object({ scores: z.array(z.object({ playerId: z.string(), value: z.number().int() })).min(1) });
router.post('/games/:id/rounds', async (req, res) => {
  try {
    const { scores } = RoundSchema.parse(req.body);
    const count = await prisma.rummyRound.count({ where: { gameId: req.params.id } });
    await prisma.rummyRound.create({
      data: { gameId: req.params.id, roundNumber: count + 1, scores: { create: scores.map((s) => ({ playerId: s.playerId, value: s.value })) } },
    });
    const game = await prisma.rummyGame.findUnique({ where: { id: req.params.id }, include: fullInclude });
    const state = withState(game);
    if (state.winner) await prisma.rummyGame.update({ where: { id: game.id }, data: { status: 'completed' } });
    res.status(201).json({ game: state });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Add a player mid-game ──────────────────────────────────────
router.post('/games/:id/players', async (req, res) => {
  try {
    const name = z.string().min(1).parse(req.body?.name);
    const count = await prisma.rummyPlayer.count({ where: { gameId: req.params.id } });
    await prisma.rummyPlayer.create({ data: { gameId: req.params.id, name, position: count } });
    const game = await prisma.rummyGame.findUnique({ where: { id: req.params.id }, include: fullInclude });
    res.status(201).json({ game: withState(game) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Saved player names (Add Players roster) ────────────────────
router.get('/players', async (req, res) => {
  const userId = await userIdFrom(req);
  const where = userId ? { game: { userId } } : {};
  const rows = await prisma.rummyPlayer.findMany({ where, select: { name: true }, distinct: ['name'], take: 100, orderBy: { name: 'asc' } });
  res.json({ players: rows.map((r) => r.name) });
});

// ── Player roster (Add Players on the landing screen) ──────────
// List the user's saved roster. Merge in distinct names from past games so
// previously-used players show up even if added before the roster existed.
router.get('/roster', async (req, res) => {
  const userId = await userIdFrom(req);
  // Include the guest pool (userId: null) alongside the user's own data so
  // already-played players survive the guest→login boundary (games created
  // while logged-out still show up once the user signs in).
  const rosterWhere = userId ? { OR: [{ userId }, { userId: null }] } : { userId: null };
  const gameWhere = userId ? { game: { OR: [{ userId }, { userId: null }] } } : {};

  const saved = await prisma.rummyRosterPlayer.findMany({
    where: rosterWhere,
    orderBy: { createdAt: 'asc' },
  });
  const players = [];
  const seen = new Set();
  for (const p of saved) {
    if (seen.has(p.name.toLowerCase())) continue;
    seen.add(p.name.toLowerCase());
    players.push({ id: p.id, name: p.name });
  }

  // Merge in distinct names from past games so previously-used players show up
  // even if they were added before the roster existed (or only ever in a game).
  const fromGames = await prisma.rummyPlayer.findMany({
    where: gameWhere,
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
    take: 100,
  });
  for (const r of fromGames) {
    if (seen.has(r.name.toLowerCase())) continue;
    seen.add(r.name.toLowerCase());
    players.push({ id: `game:${r.name}`, name: r.name });
  }

  res.json({ players });
});

router.post('/roster', async (req, res) => {
  try {
    const name = z.string().trim().min(1).parse(req.body?.name);
    const userId = await userIdFrom(req);
    const existing = await prisma.rummyRosterPlayer.findFirst({ where: { userId: userId ?? null, name } });
    const player = existing || await prisma.rummyRosterPlayer.create({ data: { userId, name } });
    res.status(201).json({ player: { id: player.id, name: player.name } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/roster/:id', async (req, res) => {
  try {
    await prisma.rummyRosterPlayer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
