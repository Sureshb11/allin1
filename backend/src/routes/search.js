import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: {} });

  const [players, teams, news] = await Promise.all([
    prisma.player.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, take: 10 }),
    prisma.team.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, take: 10 }),
    prisma.news.findMany({ where: { title: { contains: q, mode: 'insensitive' } }, take: 10 }),
  ]);

  res.json({ results: { players, teams, news } });
});

export default router;
