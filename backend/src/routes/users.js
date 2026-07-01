import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { entitlementsFor } from '../lib/entitlements.js';

const router = Router();

// Find an existing Local Legends user by mobile number (for "Add player" to a team).
// Matches on the last 10 digits so it works regardless of country-code formatting.
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const digits = String(req.query.phone || '').replace(/\D/g, '');
    if (digits.length < 8) return res.status(400).json({ error: 'Enter a valid mobile number' });
    const last10 = digits.slice(-10);
    const user = await prisma.user.findFirst({
      where: { phone: { endsWith: last10 } },
      select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true },
    });
    if (!user) return res.status(404).json({ error: 'No Local Legends user with that number' });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { sports: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Prefer an explicitly-linked player; fall back to matching by name.
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  let player = await prisma.player.findFirst({ where: { userId: user.id }, include: { team: true } });
  if (!player && fullName) {
    player = await prisma.player.findFirst({ where: { name: fullName }, include: { team: true } });
  }
  const { sports, ...userBase } = user;
  res.json({ user: userBase, player, sports, entitlements: entitlementsFor(user) });
});

// Aggregate stats for the logged-in user, sourced from their linked Player's stored
// stats (mapped to the shape the Profile / My Performance screens expect) plus a real
// match count from the DB. Returns zeros if the user isn't linked to a player yet.
router.get('/me/stats', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  let player = await prisma.player.findFirst({ where: { userId: user.id }, include: { team: true } });
  if (!player && fullName) player = await prisma.player.findFirst({ where: { name: fullName }, include: { team: true } });

  const base = { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 };
  if (!player) return res.json({ stats: base, sport: null, linked: false });

  const s = player.stats || {};
  // Real season match count = matches this player's team has played in their sport.
  const seasonMatches = player.teamId
    ? await prisma.match.count({ where: { sport: player.sport, OR: [{ team1Id: player.teamId }, { team2Id: player.teamId }] } })
    : 0;

  const stats = {
    ...base,
    ...s,                                   // pass through any sport-specific fields (goals, assists, …)
    matches: s.matches ?? seasonMatches,
    average: s.average ?? s.battingAverage ?? 0,
    seasonMatches,
  };
  res.json({ stats, sport: player.sport, role: player.role, team: player.team?.name || null, linked: true });
});

// Set / update the sports a user is interested in (multi-sport profile).
const SportsSchema = z.object({
  sports: z.array(z.object({
    sport:     z.string().min(1),
    isPrimary: z.boolean().optional(),
    role:      z.string().optional().nullable(),
    skill:     z.string().optional().nullable(),
  })).min(1),
});

router.put('/me/sports', authMiddleware, async (req, res) => {
  try {
    const { sports } = SportsSchema.parse(req.body);
    const userId = req.user.sub;
    const hasPrimary = sports.some(s => s.isPrimary);
    await prisma.$transaction(sports.map((s, i) => {
      const isPrimary = s.isPrimary ?? (!hasPrimary && i === 0);
      return prisma.userSport.upsert({
        where:  { userId_sport: { userId, sport: s.sport } },
        update: { isPrimary, role: s.role ?? null, skill: s.skill ?? null },
        create: { userId, sport: s.sport, isPrimary, role: s.role ?? null, skill: s.skill ?? null },
      });
    }));
    const all = await prisma.userSport.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    res.json({ sports: all });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Choose the user's active/primary sport (e.g. from the Arena picker).
// Adds the sport if new, marks it primary, and unsets primary on the others.
const PrimarySportSchema = z.object({ sport: z.string().min(1) });

router.post('/me/primary-sport', authMiddleware, async (req, res) => {
  try {
    const { sport } = PrimarySportSchema.parse(req.body);
    const userId = req.user.sub;
    await prisma.$transaction([
      prisma.userSport.updateMany({ where: { userId }, data: { isPrimary: false } }),
      prisma.userSport.upsert({
        where:  { userId_sport: { userId, sport } },
        update: { isPrimary: true },
        create: { userId, sport, isPrimary: true },
      }),
    ]);
    const sports = await prisma.userSport.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    res.json({ sports });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const ProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(500).optional().nullable()
});

router.put('/me', authMiddleware, async (req, res) => {
  try {
    const data = ProfileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user.sub }, data });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
