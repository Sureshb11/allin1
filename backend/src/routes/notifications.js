import { Router } from 'express';
import { authMiddleware } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user.sub },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ notifications: items });
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
