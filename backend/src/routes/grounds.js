import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const grounds = await prisma.ground.findMany({ orderBy: { name: 'asc' } });
  res.json({ grounds });
});

const BookingSchema = z.object({
  groundId: z.string(),
  date: z.string(),
  slot: z.string(),
});

router.post('/book', authMiddleware, async (req, res) => {
  try {
    const data = BookingSchema.parse(req.body);
    const booking = await prisma.booking.create({
      data: { ...data, date: new Date(data.date), userId: req.user.sub },
    });
    res.status(201).json({ booking });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
