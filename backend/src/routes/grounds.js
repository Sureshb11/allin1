import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';
import { requireAdmin, isAdmin } from '../lib/adminAuth.js';

const router = Router();

const PAGE_SIZE = 30;

// ── LIST / SEARCH ──────────────────────────────────────────────────────────
// GET /grounds?city=Chennai&type=indoor&surface=turf&ball=leather&verified=1
//              &featured=1&q=star&sport=cricket&status=published&cursor=xxx&limit=30
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sport, city, state, type, surface, ball, verified, featured, q, cursor, status } = req.query;
    const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, 50);

    const where = {};
    // Default to published for non-admins
    where.status = status && isAdmin(req.user?.sub) ? status : 'published';
    where.permanentlyClosed = false;

    if (sport) where.sport = sport;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (state) where.state = { contains: state, mode: 'insensitive' };
    if (type) where.groundType = type;
    if (surface) where.playingSurface = surface;
    if (verified === '1' || verified === 'true') where.verified = true;
    if (featured === '1' || featured === 'true') where.featured = true;
    if (ball) {
      // ballTypes is a JSON array; search for grounds containing this ball type
      where.ballTypes = { array_contains: ball };
    }
    if (q && q.trim()) {
      const needle = q.trim();
      where.OR = [
        { name: { contains: needle, mode: 'insensitive' } },
        { localName: { contains: needle, mode: 'insensitive' } },
        { city: { contains: needle, mode: 'insensitive' } },
        { area: { contains: needle, mode: 'insensitive' } },
        { address: { contains: needle, mode: 'insensitive' } },
      ];
    }

    const grounds = await prisma.ground.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { averageRating: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        images: { where: { imageType: 'cover' }, take: 1 },
        amenities: true,
        _count: { select: { reviews: true, favourites: true } },
      },
    });

    const hasMore = grounds.length > limit;
    const page = hasMore ? grounds.slice(0, limit) : grounds;

    // Per-type counts for filter chips
    const baseWhere = { status: 'published', permanentlyClosed: false };
    if (sport) baseWhere.sport = sport;
    if (q && q.trim()) {
      const needle = q.trim();
      baseWhere.OR = [
        { name: { contains: needle, mode: 'insensitive' } },
        { city: { contains: needle, mode: 'insensitive' } },
      ];
    }
    const typeCounts = await prisma.ground.groupBy({
      by: ['groundType'],
      where: baseWhere,
      _count: { _all: true },
    });

    // Admin: pending count
    let pendingCount = 0;
    if (req.user?.sub && isAdmin(req.user.sub)) {
      pendingCount = await prisma.ground.count({ where: { status: 'pending' } });
    }

    // User's favourites for this page
    let userFavIds = [];
    if (req.user?.sub) {
      const favs = await prisma.groundFavourite.findMany({
        where: { userId: req.user.sub, groundId: { in: page.map((g) => g.id) } },
        select: { groundId: true },
      });
      userFavIds = favs.map((f) => f.groundId);
    }

    res.json({
      grounds: page,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
      typeCounts: typeCounts.reduce((acc, t) => { acc[t.groundType] = t._count._all; return acc; }, {}),
      total: await prisma.ground.count({ where: baseWhere }),
      pendingCount,
      userFavIds,
      isAdmin: req.user?.sub ? isAdmin(req.user.sub) : false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DETAIL ─────────────────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const ground = await prisma.ground.findUnique({
      where: { id: req.params.id },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        openingHours: { orderBy: { id: 'asc' } },
        amenities: true,
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { reviews: true, favourites: true, bookings: true } },
      },
    });
    if (!ground) return res.status(404).json({ error: 'Ground not found' });

    // Check if current user has favourited
    let isFavourited = false;
    if (req.user?.sub) {
      const fav = await prisma.groundFavourite.findUnique({
        where: { userId_groundId: { userId: req.user.sub, groundId: ground.id } },
      });
      isFavourited = !!fav;
    }

    // Resolve reviewer names
    const reviewerIds = [...new Set(ground.reviews.map((r) => r.userId))];
    const users = reviewerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      ground,
      isFavourited,
      reviewers: userMap,
      isAdmin: req.user?.sub ? isAdmin(req.user.sub) : false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SUBMIT GROUND REQUEST ──────────────────────────────────────────────────
const GroundRequestSchema = z.object({
  name: z.string().min(2),
  localName: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  groundType: z.string().default('outdoor'),
  playingSurface: z.string().optional(),
  ballTypes: z.array(z.string()).optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  street: z.string().optional(),
  area: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  imageUrl: z.string().optional(),
  sport: z.string().default('cricket'),
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = GroundRequestSchema.parse(req.body);
    const coverImage = data.imageUrl;
    delete data.imageUrl;

    const ground = await prisma.ground.create({
      data: {
        ...data,
        ballTypes: data.ballTypes || [],
        submittedById: req.user.sub,
        status: 'pending',
        location: data.location || data.area || data.address || data.city,
        ...(coverImage
          ? { images: { create: { imageUrl: coverImage, imageType: 'cover', displayOrder: 0 } } }
          : {}),
      },
      include: { images: true },
    });

    res.status(201).json({ success: true, ground });
  } catch (e) {
    if (e.name === 'ZodError') return res.status(400).json({ error: e.errors[0]?.message || 'Validation error' });
    res.status(400).json({ error: e.message });
  }
});

// ── UPDATE GROUND (admin) ──────────────────────────────────────────────────
router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const ground = await prisma.ground.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ ground });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── TOGGLE FAVOURITE ───────────────────────────────────────────────────────
router.post('/:id/favourite', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.groundFavourite.findUnique({
      where: { userId_groundId: { userId: req.user.sub, groundId: req.params.id } },
    });
    if (existing) {
      await prisma.groundFavourite.delete({ where: { id: existing.id } });
      res.json({ favourited: false });
    } else {
      await prisma.groundFavourite.create({
        data: { userId: req.user.sub, groundId: req.params.id },
      });
      res.json({ favourited: true });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── USER'S FAVOURITES ──────────────────────────────────────────────────────
router.get('/user/favourites', authMiddleware, async (req, res) => {
  try {
    const favs = await prisma.groundFavourite.findMany({
      where: { userId: req.user.sub },
      include: {
        ground: {
          include: {
            images: { where: { imageType: 'cover' }, take: 1 },
            amenities: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ grounds: favs.map((f) => f.ground) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ADD REVIEW ─────────────────────────────────────────────────────────────
router.post('/:id/review', authMiddleware, async (req, res) => {
  try {
    const { rating, review, images } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    const rev = await prisma.groundReview.create({
      data: {
        groundId: req.params.id,
        userId: req.user.sub,
        rating: Number(rating),
        review: review || null,
        images: images || null,
      },
    });

    // Update average rating
    const agg = await prisma.groundReview.aggregate({
      where: { groundId: req.params.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.ground.update({
      where: { id: req.params.id },
      data: {
        averageRating: Math.round((agg._avg.rating || 0) * 10) / 10,
        reviewCount: agg._count._all,
      },
    });

    res.status(201).json({ review: rev });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── LIST REVIEWS ───────────────────────────────────────────────────────────
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await prisma.groundReview.findMany({
      where: { groundId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    res.json({ reviews, users: Object.fromEntries(users.map((u) => [u.id, u])) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ADMIN: LIST PENDING REQUESTS ───────────────────────────────────────────
router.get('/admin/requests', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const grounds = await prisma.ground.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { where: { imageType: 'cover' }, take: 1 },
      },
    });

    // Resolve submitter names
    const submitterIds = [...new Set(grounds.map((g) => g.submittedById).filter(Boolean))];
    const users = submitterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: submitterIds } },
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
      : [];

    res.json({
      grounds,
      submitters: Object.fromEntries(users.map((u) => [u.id, u])),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ADMIN: APPROVE GROUND ──────────────────────────────────────────────────
router.post('/:id/approve', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const ground = await prisma.ground.update({
      where: { id: req.params.id },
      data: { status: 'published', rejectionReason: null },
    });
    res.json({ success: true, ground });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── ADMIN: REJECT GROUND ───────────────────────────────────────────────────
router.post('/:id/reject', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const ground = await prisma.ground.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectionReason: reason || 'Rejected by admin' },
    });
    res.json({ success: true, ground });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── BOOK GROUND (legacy-compatible) ────────────────────────────────────────
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
