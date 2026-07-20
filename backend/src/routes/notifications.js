import { Router } from 'express';
import { authMiddleware } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Newest first, paged. Previously returned EVERY notification a user had ever
// received — unbounded payload and an unbounded scan as the table grows.
// `limit` is capped server-side so a client can't ask for the whole table.
router.get('/', authMiddleware, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const cursor = req.query.cursor;   // id of the last item from the previous page

  const items = await prisma.notification.findMany({
    where: { userId: req.user.sub },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,                 // one extra row tells us if more remain
    ...(cursor ? { skip: 1, cursor: { id: String(cursor) } } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  res.json({
    notifications: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    unread: await prisma.notification.count({ where: { userId: req.user.sub, read: false } }),
  });
});

router.post('/:id/read', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const item = await prisma.notification.update({ where: { id }, data: { read: true } });
  res.json({ notification: item });
});

router.post('/read-all', authMiddleware, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.sub }, data: { read: true } });
  res.json({ success: true });
});

export default router;
