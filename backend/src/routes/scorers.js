import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';
import { canonicalVenue } from '../lib/venue.js';

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
  venue:     z.string().optional().transform(canonicalVenue),
});

router.post('/book', authMiddleware, async (req, res) => {
  try {
    const data = BookingSchema.parse(req.body);
    const booking = await prisma.scorerBooking.create({
      data: { ...data, userId: req.user.sub, matchDate: new Date(data.matchDate) },
      include: { scorer: true },
    });

    // Confirmation to the person who booked, and ONLY to them.
    //
    // The scorer cannot be told: `Scorer` is a directory row — name,
    // location, contactInfo — with no userId, so there is no account on the
    // other end of this booking. Notifying them needs a link between a listing
    // and an account, which is a schema change and a way for them to claim the
    // listing, not a line here. Until then the booking reaches them the way it
    // always has: whoever booked calls the contact number.
    await safeNotify(() => notifyUsers([req.user.sub], {
      type: 'reminder',
      title: 'Booking confirmed',
      message: `${booking.scorer?.name || 'Your scorer'} is booked for ${new Date(booking.matchDate).toDateString()}.`,
      data: { bookingId: booking.id },
    }));

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
