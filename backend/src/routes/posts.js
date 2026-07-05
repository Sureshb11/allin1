import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';

const router = Router();

// GET /posts?sport=cricket — community feed posts for a sport (+ comment counts)
router.get('/', optionalAuth, async (req, res) => {
  const { sport } = req.query;
  const where = sport ? { sport: String(sport) } : {};
  const rows = await prisma.post.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 50,
    include: { _count: { select: { comments: true } } },
  });
  // Annotate which posts the caller has liked (one query, not N) — so the heart
  // shows correctly on reopen instead of resetting (it was only tracked in memory).
  let likedSet = new Set();
  if (req.user && rows.length) {
    const likes = await prisma.like.findMany({
      where: { userId: req.user.sub, targetType: 'post', targetId: { in: rows.map((p) => p.id) } },
      select: { targetId: true },
    });
    likedSet = new Set(likes.map((l) => l.targetId));
  }
  const posts = rows.map(({ _count, ...p }) => ({ ...p, commentCount: _count.comments, liked: likedSet.has(p.id) }));
  res.json({ posts });
});

// Resolve author from an optional Bearer token, else a provided/guest name.
async function resolveAuthor(req, fallback = 'You') {
  const hdr = req.headers.authorization || '';
  if (hdr.startsWith('Bearer ')) {
    try {
      const { default: jwt } = await import('jsonwebtoken');
      const dec = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
      const u = await prisma.user.findUnique({ where: { id: dec.sub } });
      const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
      return { authorId: dec.sub, authorName: name || fallback };
    } catch { /* unauthenticated */ }
  }
  return { authorId: null, authorName: fallback };
}

// GET /posts/:id/comments
router.get('/:id/comments', async (req, res) => {
  const comments = await prisma.comment.findMany({ where: { postId: req.params.id }, orderBy: { createdAt: 'asc' }, take: 100 });
  res.json({ comments });
});

// POST /posts/:id/comments
const CommentSchema = z.object({ text: z.string().min(1).max(400), authorName: z.string().optional() });
router.post('/:id/comments', async (req, res) => {
  try {
    const { text, authorName } = CommentSchema.parse(req.body);
    const author = await resolveAuthor(req, authorName || 'You');
    const comment = await prisma.comment.create({ data: { postId: req.params.id, text, ...author } });
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (post?.authorId) {
      await prisma.notification.create({
        data: { userId: post.authorId, type: 'comment', title: 'New comment',
                message: `${author.authorName} commented: "${text.slice(0, 60)}"` },
      });
    }
    res.status(201).json({ comment });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const PostSchema = z.object({
  sport: z.string().default('cricket'),
  text: z.string().min(1).max(500),
  authorName: z.string().optional(),
  team: z.string().optional(),
  mediaUrl: z.string().url().optional().nullable(),
});

// POST /posts — create a post (auth optional; falls back to a guest name)
router.post('/', async (req, res) => {
  try {
    const data = PostSchema.parse(req.body);
    let authorId = null, authorName = data.authorName || 'You', authorAvatar = null;
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) {
      try {
        const { default: jwt } = await import('jsonwebtoken');
        const dec = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
        authorId = dec.sub;
        const u = await prisma.user.findUnique({ where: { id: dec.sub } });
        if (u) { authorName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || authorName; authorAvatar = u.avatarUrl || null; }
      } catch { /* unauthenticated post */ }
    }
    const post = await prisma.post.create({
      data: { sport: data.sport, text: data.text, team: data.team, mediaUrl: data.mediaUrl || null, authorId, authorName, authorAvatar },
    });
    res.status(201).json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /posts/:id/like — idempotent toggle (like/unlike), persisted per user so the
// heart is still correct after the app is closed and reopened.
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub, targetId = req.params.id;
    const key = { userId_targetType_targetId: { userId, targetType: 'post', targetId } };
    const existing = await prisma.like.findUnique({ where: key });

    let liked;
    if (existing) { await prisma.like.delete({ where: key }); liked = false; }
    else { await prisma.like.create({ data: { userId, targetType: 'post', targetId } }); liked = true; }

    // Recount from the source of truth and denormalise onto the post.
    const likes = await prisma.like.count({ where: { targetType: 'post', targetId } });
    const post = await prisma.post.update({ where: { id: targetId }, data: { likes } });

    if (liked && post.authorId && post.authorId !== userId) {
      const actor = await resolveAuthor(req, 'Someone');
      await prisma.notification.create({
        data: { userId: post.authorId, type: 'like', title: 'New like',
                message: `${actor.authorName} liked your post` },
      });
    }
    res.json({ post, liked, likes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
