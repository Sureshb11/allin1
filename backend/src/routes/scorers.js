import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { location, available } = req.query;
    const where = {};
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (available !== undefined) where.available = available === 'true';

    const scorers = await prisma.scorer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ scorers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const scorer = await prisma.scorer.findUnique({
    where: { id: req.params.id },
    include: { bookings: { orderBy: { matchDate: 'desc' }, take: 10 } },
  });
  if (!scorer) return res.status(404).json({ error: 'Scorer not found' });
  res.json({ scorer });
});

const ScorerSchema = z.object({
  name:        z.string().min(1),
  experience:  z.number().int().optional(),
  location:    z.string().optional(),
  contactInfo: z.string().optional(),
});

router.post('/register', authMiddleware, async (req, res) => {
  try {
    const data = ScorerSchema.parse(req.body);
    const scorer = await prisma.scorer.create({ data });
    res.status(201).json({ scorer });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const BookingSchema = z.object({
  scorerId:  z.string(),
  matchDate: z.string().datetime(),
  venue:     z.string().optional(),
});

router.post('/book', authMiddleware, async (req, res) => {
  try {
    const data = BookingSchema.parse(req.body);
    const booking = await prisma.scorerBooking.create({
      data: { ...data, userId: req.user.sub, matchDate: new Date(data.matchDate) },
      include: { scorer: true },
    });
    res.status(201).json({ booking });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/bookings/mine', authMiddleware, async (req, res) => {
  try {
    const bookings = await prisma.scorerBooking.findMany({
      where: { userId: req.user.sub },
      include: { scorer: true },
      orderBy: { matchDate: 'desc' },
    });
    res.json({ bookings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
