import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const badges = await prisma.badge.findMany({ orderBy: { points: 'desc' } });
  res.json({ badges });
});

router.get('/leaderboard', async (req, res) => {
  const leaderboard = await prisma.userBadge.groupBy({
    by: ['userId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  });
  res.json({ leaderboard });
});

export default router;
