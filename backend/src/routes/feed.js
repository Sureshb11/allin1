// /feed — Module 8 activity feed: polymorphic cards, cursor pagination, likes.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';

const router = Router();

// GET /feed?sport=cricket&cursor=<createdAtISO>_<id>&limit=20
// Keyset/cursor pagination on (createdAt, id) — new items prepended at the top
// never shift the page, so scrolling never duplicates rows (unlike offset).
router.get('/', optionalAuth, async (req, res) => {
  try {
    const sport = req.query.sport ? String(req.query.sport) : undefined;
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const where = { ...(sport ? { sport } : {}) };

    if (req.query.cursor && req.query.cursor !== 'null') {
      const [ts, id] = String(req.query.cursor).split('_');
      const cur = new Date(ts);
      if (!isNaN(cur.getTime()) && id) {
        // (createdAt, id) < cursor  → the "older than" half of a keyset scan
        where.OR = [
          { createdAt: { lt: cur } },
          { createdAt: cur, id: { lt: id } },
        ];
      }
    }

    const items = await prisma.activityFeed.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null;

    // Annotate which items the caller has liked (one query, not N).
    let likedSet = new Set();
    if (req.user && page.length) {
      const likes = await prisma.like.findMany({
        where: { userId: req.user.sub, targetType: 'feed', targetId: { in: page.map((p) => p.id) } },
        select: { targetId: true },
      });
      likedSet = new Set(likes.map((l) => l.targetId));
    }

    res.json({
      feed: page.map((p) => ({ ...p, liked: likedSet.has(p.id) })),
      nextCursor, hasMore,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /feed/:id/like — idempotent toggle. Returns the real count + liked state.
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub, targetId = req.params.id;
    const key = { userId_targetType_targetId: { userId, targetType: 'feed', targetId } };
    const existing = await prisma.like.findUnique({ where: key });

    let liked;
    if (existing) { await prisma.like.delete({ where: key }); liked = false; }
    else { await prisma.like.create({ data: { userId, targetType: 'feed', targetId } }); liked = true; }

    // Recount from the source of truth and denormalise onto the card.
    const likes = await prisma.like.count({ where: { targetType: 'feed', targetId } });
    await prisma.activityFeed.update({ where: { id: targetId }, data: { likes } }).catch(() => {});

    res.json({ success: true, liked, likes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
