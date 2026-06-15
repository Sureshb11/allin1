import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// GET /coaching?location=Mumbai&speciality=Batting
router.get('/', async (req, res) => {
  try {
    const { location, speciality, available } = req.query;
    const where = {};
    if (location)    where.location    = { contains: location, mode: 'insensitive' };
    if (speciality)  where.speciality  = speciality;
    if (available !== undefined) where.available = available === 'true';

    const coaches = await prisma.coach.findMany({
      where,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    res.json({ coaches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const coach = await prisma.coach.findUnique({
    where: { id: req.params.id },
    include: { bookings: { orderBy: { date: 'desc' }, take: 10 } },
  });
  if (!coach) return res.status(404).json({ error: 'Coach not found' });
  res.json({ coach });
});

const CoachSchema = z.object({
  name:        z.string().min(1),
  speciality:  z.string().optional(),
  experience:  z.number().int().optional(),
  location:    z.string().optional(),
  bio:         z.string().optional(),
  pricePerHour: z.number().int().optional(),
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = CoachSchema.parse(req.body);
    const coach = await prisma.coach.create({ data });
    res.status(201).json({ coach });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Book a coaching session
const BookingSchema = z.object({
  coachId:  z.string(),
  date:     z.string().datetime(),
  duration: z.number().int().min(1).default(1),
  notes:    z.string().optional(),
});

router.post('/book', authMiddleware, async (req, res) => {
  try {
    const data = BookingSchema.parse(req.body);
    const booking = await prisma.coachBooking.create({
      data: { ...data, userId: req.user.sub, date: new Date(data.date) },
      include: { coach: true },
    });
    res.status(201).json({ booking });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// My bookings
router.get('/bookings/mine', authMiddleware, async (req, res) => {
  try {
    const bookings = await prisma.coachBooking.findMany({
      where: { userId: req.user.sub },
      include: { coach: true },
      orderBy: { date: 'desc' },
    });
    res.json({ bookings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
