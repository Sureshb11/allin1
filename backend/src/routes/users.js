import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Link the user to a player profile by name (if one exists), so the app can
  // show real batting/bowling stats for the logged-in cricketer.
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const player = fullName
    ? await prisma.player.findFirst({ where: { name: fullName }, include: { team: true } })
    : null;
  res.json({ user, player });
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
