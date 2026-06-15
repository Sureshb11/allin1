import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

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
  res.json({ user: userBase, player, sports });
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
