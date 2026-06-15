import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// GET /looking-for?type=player&location=Mumbai
router.get('/', async (req, res) => {
  try {
    const { type, location, format, sport, status = 'open' } = req.query;
    const where = { status };
    if (type) where.type = type;
    if (sport) where.sport = sport;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (format) where.format = format;

    const posts = await prisma.lookingFor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const post = await prisma.lookingFor.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ post });
});

const LookingForSchema = z.object({
  sport:       z.string().optional(),
  type:        z.enum(['player', 'team', 'umpire', 'scorer', 'coach', 'opponent', 'commentator']),
  title:       z.string().min(1),
  description: z.string().optional(),
  location:    z.string().optional(),
  format:      z.string().optional(),
  ageGroup:    z.string().optional(),
  contactInfo: z.string().optional(),
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = LookingForSchema.parse(req.body);
    const post = await prisma.lookingFor.create({
      data: { ...data, postedById: req.user.sub },
    });
    res.status(201).json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const post = await prisma.lookingFor.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.lookingFor.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
