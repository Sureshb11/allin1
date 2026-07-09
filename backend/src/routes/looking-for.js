import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';

const router = Router();

// GET /looking-for?type=player&location=Mumbai
// Everyone sees OPEN listings; the signed-in user also sees THEIR OWN closed/filled
// ones (so accepted chats stay reachable) — marked with a FILLED badge in the app.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, location, format, sport } = req.query;
    const filters = {};
    if (type) filters.type = type;
    if (sport) filters.sport = sport;
    if (location) filters.location = { contains: location, mode: 'insensitive' };
    if (format) filters.format = format;

    const me = req.user?.sub;
    const visibility = me ? { OR: [{ status: 'open' }, { postedById: me }] } : { status: 'open' };
    const where = { AND: [filters, visibility] };

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

// ── Connect requests (chat unlocks only after the poster accepts) ────────────
// My connections — both requests I received (as poster) and sent (as requester).
router.get('/connections', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const conns = await prisma.lookingForConnection.findMany({
      where: { OR: [{ posterId: me }, { requesterId: me }] },
      orderBy: { createdAt: 'desc' },
    });
    const userIds = [...new Set(conns.flatMap((c) => [c.requesterId, c.posterId]))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameOf = (id) => {
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Player' : 'Player';
    };
    res.json({ connections: conns.map((c) => ({ ...c, requesterName: nameOf(c.requesterId), posterName: nameOf(c.posterId) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Poster accepts/declines a request. Accept spins up a direct chat room.
router.put('/connections/:id', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const { action } = req.body; // 'accept' | 'decline'
    const conn = await prisma.lookingForConnection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Request not found' });
    if (conn.posterId !== me) return res.status(403).json({ error: 'Only the poster can respond' });
    if (action === 'decline') {
      const updated = await prisma.lookingForConnection.update({ where: { id: conn.id }, data: { status: 'declined' } });
      return res.json({ connection: updated });
    }
    let chatRoomId = conn.chatRoomId;
    if (!chatRoomId) {
      const listing = await prisma.lookingFor.findUnique({ where: { id: conn.listingId } });
      const room = await prisma.chatRoom.create({
        data: {
          name: listing?.title || 'Scout chat',
          type: 'direct',
          members: { create: [{ userId: conn.posterId }, { userId: conn.requesterId }] },
        },
      });
      chatRoomId = room.id;
    }
    const updated = await prisma.lookingForConnection.update({ where: { id: conn.id }, data: { status: 'accepted', chatRoomId } });
    res.json({ connection: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Send a connect request to a listing's poster.
router.post('/:id/connect', authMiddleware, async (req, res) => {
  try {
    const listing = await prisma.lookingFor.findUnique({ where: { id: req.params.id } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (!listing.postedById) return res.status(400).json({ error: 'This listing has no owner' });
    if (listing.postedById === req.user.sub) return res.status(400).json({ error: 'Cannot connect to your own listing' });
    const conn = await prisma.lookingForConnection.upsert({
      where: { listingId_requesterId: { listingId: listing.id, requesterId: req.user.sub } },
      update: {},
      create: { listingId: listing.id, requesterId: req.user.sub, posterId: listing.postedById, status: 'pending' },
    });
    res.status(201).json({ connection: conn });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
    // Closing/filling a listing auto-declines still-pending connect requests
    // (already-accepted ones keep their chat rooms).
    if (status === 'closed' || status === 'filled') {
      await prisma.lookingForConnection.updateMany({
        where: { listingId: post.id, status: 'pending' },
        data: { status: 'declined' },
      });
    }
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
