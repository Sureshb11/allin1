import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';

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

    // Confirmation to the person who booked, and ONLY to them.
    //
    // The coach cannot be told: `Coach` is a directory row — name,
    // location, contactInfo — with no userId, so there is no account on the
    // other end of this booking. Notifying them needs a link between a listing
    // and an account, which is a schema change and a way for them to claim the
    // listing, not a line here. Until then the booking reaches them the way it
    // always has: whoever booked calls the contact number.
    await safeNotify(() => notifyUsers([req.user.sub], {
      type: 'reminder',
      title: 'Booking confirmed',
      message: `${booking.coach?.name || 'Your coach'} is booked for ${new Date(booking.date).toDateString()}.`,
      data: { bookingId: booking.id },
    }));

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
