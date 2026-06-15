import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// GET /posts?sport=cricket — community feed posts for a sport
router.get('/', async (req, res) => {
  const { sport } = req.query;
  const where = sport ? { sport: String(sport) } : {};
  const posts = await prisma.post.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ posts });
});

const PostSchema = z.object({
  sport: z.string().default('cricket'),
  text: z.string().min(1).max(500),
  authorName: z.string().optional(),
  team: z.string().optional(),
});

// POST /posts — create a post (auth optional; falls back to a guest name)
router.post('/', async (req, res) => {
  try {
    const data = PostSchema.parse(req.body);
    let authorId = null, authorName = data.authorName || 'You';
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) {
      try {
        const { default: jwt } = await import('jsonwebtoken');
        const dec = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
        authorId = dec.sub;
        const u = await prisma.user.findUnique({ where: { id: dec.sub } });
        if (u) authorName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || authorName;
      } catch { /* unauthenticated post */ }
    }
    const post = await prisma.post.create({
      data: { sport: data.sport, text: data.text, team: data.team, authorId, authorName },
    });
    res.status(201).json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /posts/:id/like
router.post('/:id/like', async (req, res) => {
  try {
    const post = await prisma.post.update({ where: { id: req.params.id }, data: { likes: { increment: 1 } } });
    res.json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
