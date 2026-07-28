import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';

const router = Router();

// GET /looking-for?type=player&location=Mumbai
// The board is live opportunities only — OPEN listings, for everyone including
// the poster. A filled listing leaves immediately.
//
// This used to keep your own closed listings visible "so accepted chats stay
// reachable", which was true when the chat button lived on the listing card. It
// doesn't now: accepted connections are their own block, sourced from
// /connections and opened via the connection's chatRoomId, and each one carries
// its listing's title. So a filled listing can go without stranding anything —
// and the poster stops scrolling past their own finished asks.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, location, format, sport } = req.query;
    const filters = {};
    if (type) filters.type = type;
    if (sport) filters.sport = sport;
    if (location) filters.location = { contains: location, mode: 'insensitive' };
    if (format) filters.format = format;

    const where = { AND: [filters, { status: 'open' }] };

    const posts = await prisma.lookingFor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // The app filters by type client-side (instant tab switches + per-type
      // counts on the chips), so this has to return the whole board, not one
      // type's worth.
      take: 200,
    });

    // Who posted it. LookingFor.postedById is a bare column with no relation, so
    // this is the same manual join /connections already does. Without it the
    // board is anonymous — no name, no face, nothing to judge a stranger on.
    const posterIds = [...new Set(posts.map((p) => p.postedById).filter(Boolean))];
    const posters = posterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: posterIds } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    const byId = new Map(posters.map((u) => [u.id, u]));

    res.json({
      posts: posts.map((p) => {
        const u = p.postedById ? byId.get(p.postedById) : null;
        return {
          ...p,
          posterName: u ? `${u.firstName} ${u.lastName || ''}`.trim() : null,
          posterAvatarUrl: u?.avatarUrl || null,
        };
      }),
    });
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
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, avatarUrl: true } })
      : [];
    const nameOf = (id) => {
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Player' : 'Player';
    };
    const avatarOf = (id) => users.find((x) => x.id === id)?.avatarUrl || null;

    // The listing a connection came from, carried on the connection itself. A
    // filled listing leaves the board immediately, so the app can no longer look
    // its title up from the feed — without this, an accepted chat loses the one
    // piece of context that says what it was ever about.
    const listingIds = [...new Set(conns.map((c) => c.listingId).filter(Boolean))];
    const listings = listingIds.length
      ? await prisma.lookingFor.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true, type: true, status: true } })
      : [];
    const listingOf = (id) => listings.find((l) => l.id === id);

    res.json({
      connections: conns.map((c) => {
        const l = listingOf(c.listingId);
        return {
          ...c,
          requesterName: nameOf(c.requesterId),
          posterName: nameOf(c.posterId),
          requesterAvatarUrl: avatarOf(c.requesterId),
          posterAvatarUrl: avatarOf(c.posterId),
          listingTitle: l?.title || null,
          listingType: l?.type || null,
          listingStatus: l?.status || null,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get-or-create the room for a connection. Callable at ANY status: the room
// used to exist only after an accept, so a poster couldn't ask a single
// question before committing — which is exactly when they most want to.
async function roomFor(conn) {
  if (conn.chatRoomId) return conn.chatRoomId;
  const listing = await prisma.lookingFor.findUnique({ where: { id: conn.listingId }, select: { title: true } });
  const room = await prisma.chatRoom.create({
    data: {
      name: listing?.title || 'Scout chat',
      // 'scout', not 'direct' — tournament rooms also used 'direct', so the two
      // were indistinguishable and the chat list couldn't group them apart.
      type: 'scout',
      members: { create: [{ userId: conn.posterId }, { userId: conn.requesterId }] },
    },
  });
  await prisma.lookingForConnection.update({ where: { id: conn.id }, data: { chatRoomId: room.id } });
  return room.id;
}

// Open (or start) the conversation about a connection — either party, any
// status. Created lazily so requests nobody discusses leave no empty rooms.
router.post('/connections/:id/chat', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const conn = await prisma.lookingForConnection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Request not found' });
    if (conn.posterId !== me && conn.requesterId !== me) {
      return res.status(403).json({ error: 'Only the two people in this request can open it.' });
    }
    const listing = await prisma.lookingFor.findUnique({ where: { id: conn.listingId }, select: { title: true } });
    res.json({ chatRoomId: await roomFor(conn), name: listing?.title || 'Scout chat' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Poster accepts/declines a request.
router.put('/connections/:id', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const { action } = req.body; // 'accept' | 'decline'
    const conn = await prisma.lookingForConnection.findUnique({ where: { id: req.params.id } });
    if (!conn) return res.status(404).json({ error: 'Request not found' });
    if (conn.posterId !== me) return res.status(403).json({ error: 'Only the poster can respond' });

    const listing = await prisma.lookingFor.findUnique({ where: { id: conn.listingId }, select: { title: true } });
    const title = listing?.title || 'your listing';

    if (action === 'decline') {
      const updated = await prisma.lookingForConnection.update({ where: { id: conn.id }, data: { status: 'declined' } });
      // A decline told the requester nothing — they just watched it sit there.
      await safeNotify(() => notifyUsers([conn.requesterId], {
        title: 'Request declined',
        message: `Your request on "${title}" wasn't accepted.`,
        data: { listingId: conn.listingId },
      }));
      return res.json({ connection: updated });
    }

    const chatRoomId = await roomFor(conn);
    const updated = await prisma.lookingForConnection.update({ where: { id: conn.id }, data: { status: 'accepted', chatRoomId } });
    await safeNotify(() => notifyUsers([conn.requesterId], {
      title: 'Request accepted',
      message: `You're connected on "${title}" — you can chat now.`,
      data: { listingId: conn.listingId },
    }));
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
    const key = { listingId_requesterId: { listingId: listing.id, requesterId: req.user.sub } };
    // Check first, so the notify below fires only on a genuinely new request —
    // the upsert is a no-op on repeat taps and re-pinging would just be noise.
    const existing = await prisma.lookingForConnection.findUnique({ where: key });
    const conn = await prisma.lookingForConnection.upsert({
      where: key,
      update: {},
      create: { listingId: listing.id, requesterId: req.user.sub, posterId: listing.postedById, status: 'pending' },
    });
    // The poster was never told anyone wanted in — a listing could sit with
    // requests on it indefinitely while they had no reason to open the screen.
    if (!existing) {
      const me = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { firstName: true, lastName: true } });
      const who = me ? `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'Someone' : 'Someone';
      await safeNotify(() => notifyUsers([listing.postedById], {
        title: 'New request',
        message: `${who} wants to connect on "${listing.title || 'your listing'}".`,
        data: { listingId: listing.id },
      }));
    }
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
    // authMiddleware only proves you're signed in. Without this, any account
    // could close someone else's listing — and closing bulk-declines every
    // pending request on it, so it was a one-call way to kill a stranger's
    // recruiting. /connections/:id/respond already guards this way.
    const existing = await prisma.lookingFor.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Listing not found' });
    if (existing.postedById !== req.user.sub) {
      return res.status(403).json({ error: 'Only the poster can change this listing' });
    }

    const post = await prisma.lookingFor.update({
      where: { id: req.params.id },
      data: { status },
    });
    // Closing/filling a listing auto-declines still-pending connect requests
    // (already-accepted ones keep their chat rooms).
    if (status === 'closed' || status === 'filled') {
      // Read them first — updateMany can't tell us who it touched, and these
      // people are owed an answer. Being silently dropped after asking to join
      // is worse than being declined outright: the listing also stops being
      // visible to them, so it just disappears.
      const pending = await prisma.lookingForConnection.findMany({
        where: { listingId: post.id, status: 'pending' },
        select: { requesterId: true },
      });
      await prisma.lookingForConnection.updateMany({
        where: { listingId: post.id, status: 'pending' },
        data: { status: 'declined' },
      });
      if (pending.length) {
        // Same shape as the accept/decline notifications above — default type,
        // listingId in data — so the app handles all three identically.
        await safeNotify(() => notifyUsers(pending.map((p) => p.requesterId), {
          title: 'Listing filled',
          message: `"${post.title}" has been filled, so your request was closed.`,
          data: { listingId: post.id },
        }));
      }
    }
    res.json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // Same hole as PUT: unguarded, this deleted any listing by id.
    const existing = await prisma.lookingFor.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Listing not found' });
    if (existing.postedById !== req.user.sub) {
      return res.status(403).json({ error: 'Only the poster can delete this listing' });
    }
    await prisma.lookingFor.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
