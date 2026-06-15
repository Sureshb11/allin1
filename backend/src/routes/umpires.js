import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { location, level, available } = req.query;
    const where = {};
    if (location)  where.location = { contains: location, mode: 'insensitive' };
    if (level)     where.level    = level;
    if (available !== undefined) where.available = available === 'true';

    const umpires = await prisma.umpire.findMany({
      where,
      orderBy: [{ matchesUmpired: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    res.json({ umpires });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const umpire = await prisma.umpire.findUnique({ where: { id: req.params.id } });
  if (!umpire) return res.status(404).json({ error: 'Umpire not found' });
  res.json({ umpire });
});

const UmpireSchema = z.object({
  name:        z.string().min(1),
  level:       z.string().optional(),
  experience:  z.number().int().optional(),
  location:    z.string().optional(),
  bio:         z.string().optional(),
  contactInfo: z.string().optional(),
});

// Register as umpire
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const data = UmpireSchema.parse(req.body);
    const umpire = await prisma.umpire.create({ data });
    res.status(201).json({ umpire });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { available } = req.body;
    const umpire = await prisma.umpire.update({
      where: { id: req.params.id },
      data: { available },
    });
    res.json({ umpire });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
