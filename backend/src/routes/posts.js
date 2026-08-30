import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';
import { getSportParticipantType } from '../lib/sports.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';

const router = Router();

// Saves live in the polymorphic `Like` table under their own targetType — see
// the note on POST /:id/save.
const SAVE_TYPE = 'post_save';

// GET /posts?sport=cricket — community feed posts for a sport (+ comment counts)
// GET /posts?sport=&playerId= — the community feed, or one person's posts.
//
// `playerId` filters to the ACCOUNT behind that player rather than adding a
// route of its own, so one person's posts come back through the same liked /
// saved / authorPlayerId annotation the feed uses. A second route would have
// meant a second copy of all of it, drifting the first time one was fixed.
router.get('/', optionalAuth, async (req, res) => {
  const { sport, playerId } = req.query;
  const where = sport ? { sport: String(sport) } : {};
  if (playerId) {
    const author = await prisma.player.findUnique({
      where: { id: String(playerId) }, select: { userId: true },
    });
    if (!author) return res.json({ posts: [] });
    // Matched the way `authorPlayerId` below attributes a post: an explicit
    // Post.playerId first, otherwise the account behind the player. Filtering on
    // authorId alone would drop a post this very route hands back under this
    // player's name — tap the name, and the post is missing from their list.
    //
    // An unclaimed player can still have posts filed against them by id, so this
    // does not short-circuit on a missing userId. What it must never do is fall
    // through with no filter at all: that would answer "this player's posts"
    // with every post in the sport.
    where.OR = [
      { playerId: String(playerId) },
      ...(author.userId ? [{ authorId: author.userId }] : []),
    ];
  }
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
  // Same one-query trick for "have I saved this", so the bookmark shows
  // correctly on reopen rather than only for the session that tapped it.
  let savedSet = new Set();
  if (req.user && rows.length) {
    const saves = await prisma.like.findMany({
      where: { userId: req.user.sub, targetType: SAVE_TYPE, targetId: { in: rows.map((p) => p.id) } },
      select: { targetId: true },
    });
    savedSet = new Set(saves.map((l) => l.targetId));
  }
  // The author's PLAYER id, so tapping a name in the feed can open their
  // profile. A post carries authorId (a User), but a profile is keyed by Player,
  // and a user can have one per sport — so resolve within the post's own sport.
  // One query for the whole page rather than one per post.
  const authorIds = [...new Set(rows.map((p) => p.authorId).filter(Boolean))];
  const playerByUser = {};
  if (authorIds.length) {
    const linked = await prisma.player.findMany({
      where: { userId: { in: authorIds }, ...(sport ? { sport: String(sport) } : {}) },
      select: { id: true, userId: true },
    });
    for (const pl of linked) if (!playerByUser[pl.userId]) playerByUser[pl.userId] = pl.id;
  }

  const posts = rows.map(({ _count, ...p }) => ({
    ...p,
    commentCount: _count.comments,
    liked: likedSet.has(p.id),
    saved: savedSet.has(p.id),
    authorPlayerId: p.playerId || playerByUser[p.authorId] || null,
    // Whose post this is, so the app knows whether to offer Delete. Decided
    // here rather than by comparing ids in each list screen — the server is
    // going to check authorship on the delete anyway, so this is the same
    // answer from the same place.
    mine: !!req.user && p.authorId === req.user.sub,
  }));
  res.json({ posts });
});

// DELETE /posts/:id — remove your own post.
//
// There was no way to do this at all: the feed's ⋯ menu offered Share and a
// Report that showed a toast and filed nothing, so a post — a photo, a typo, a
// thing said in temper — was permanent to the person who wrote it.
//
// Author only. Not "admin or author": there is no moderation surface in this
// app yet, and a delete that anyone could reach is worse than no delete.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id }, select: { id: true, authorId: true },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!post.authorId || post.authorId !== req.user.sub) {
      return res.status(403).json({ error: 'You can only delete your own post' });
    }

    // Comments hold a foreign key to the post, so they go first or the delete
    // is rejected. Likes and saves live in the polymorphic Like table with no
    // constraint to enforce that — which means nothing would fail, they would
    // just linger as rows pointing at a post that no longer exists, and count
    // towards nothing forever.
    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { postId: post.id } }),
      prisma.like.deleteMany({ where: { targetType: { in: ['post', SAVE_TYPE] }, targetId: post.id } }),
      prisma.post.delete({ where: { id: post.id } }),
    ]);

    // Notifications about the post are deliberately left alone. They are a
    // record of something that did happen — "X liked your post" was true when
    // it was sent — and their deep link already falls through to the
    // notification list rather than a missing screen.
    res.json({ deleted: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /posts/saved?sport=cricket — the caller's saved posts, newest save first.
// Declared before any '/:id' route so "saved" is never read as an id.
//
// Sport-scoped like every other post query: a save is filtered by the post's
// own sport, so switching Arena shows that sport's saved posts rather than one
// undivided pile. Omitting ?sport returns every sport.
router.get('/saved', authMiddleware, async (req, res) => {
  const { sport } = req.query;
  const saves = await prisma.like.findMany({
    where: { userId: req.user.sub, targetType: SAVE_TYPE },
    orderBy: { createdAt: 'desc' },
    select: { targetId: true },
  });
  const ids = saves.map((s) => s.targetId);
  if (!ids.length) return res.json({ posts: [] });

  const rows = await prisma.post.findMany({
    where: { id: { in: ids }, ...(sport ? { sport: String(sport) } : {}) },
    include: { _count: { select: { comments: true } } },
  });
  // findMany can't preserve the id order, so restore "newest save first" here.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const liked = await prisma.like.findMany({
    where: { userId: req.user.sub, targetType: 'post', targetId: { in: ids } },
    select: { targetId: true },
  });
  const likedSet2 = new Set(liked.map((l) => l.targetId));

  const posts = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(({ _count, ...p }) => ({
      ...p, commentCount: _count.comments, liked: likedSet2.has(p.id), saved: true,
      // Same flag the feed sets — a post you saved can be your own, and the
      // Delete option has to appear there too.
      mine: p.authorId === req.user.sub,
    }));
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
    // Through notifyUsers, not prisma.notification.create: the helper writes the
    // row AND mirrors it to the device as a real push. Written directly, a
    // comment only ever appeared the next time the bell screen was fetched —
    // the phone never buzzed. Skipped when you comment on your own post.
    if (post?.authorId && post.authorId !== author.authorId) {
      await safeNotify(() => notifyUsers([post.authorId], {
        type: 'comment',
        title: 'New comment',
        message: `${author.authorName} commented: "${text.slice(0, 60)}"`,
        data: { postId: post.id },
      }));
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
  mediaType: z.string().optional().nullable(),
  postType: z.string().default('general'),
  matchId: z.string().optional().nullable(),
  tournamentId: z.string().optional().nullable(),
  playerId: z.string().optional().nullable(),
});

// POST /posts — create a post (auth optional; falls back to a guest name)
router.post('/', async (req, res) => {
  try {
    const data = PostSchema.parse(req.body);
    if (!getSportParticipantType(data.sport)) {
      return res.status(400).json({ error: 'INVALID_SPORT' });
    }

    if (data.matchId) {
      const match = await prisma.match.findUnique({ where: { id: data.matchId }, select: { sport: true } });
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (match.sport !== data.sport) return res.status(400).json({ error: 'Cross-sport match reference rejected' });
    }
    if (data.tournamentId) {
      const tournament = await prisma.tournament.findUnique({ where: { id: data.tournamentId }, select: { sport: true } });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
      if (tournament.sport !== data.sport) return res.status(400).json({ error: 'Cross-sport tournament reference rejected' });
    }
    if (data.playerId) {
      const player = await prisma.player.findUnique({ where: { id: data.playerId }, select: { sport: true } });
      if (!player) return res.status(404).json({ error: 'Player not found' });
      if (player.sport !== data.sport) return res.status(400).json({ error: 'Cross-sport player reference rejected' });
    }

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
      data: { 
        sport: data.sport, 
        text: data.text, 
        team: data.team, 
        mediaUrl: data.mediaUrl || null, 
        mediaType: data.mediaType || null,
        postType: data.postType || 'general',
        matchId: data.matchId || null,
        tournamentId: data.tournamentId || null,
        playerId: data.playerId || null,
        authorId, 
        authorName, 
        authorAvatar 
      },
    });
    res.status(201).json({ post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /posts/:id/like — idempotent toggle (like/unlike), persisted per user so the
// heart is still correct after the app is closed and reopened.
// POST /posts/:id/save — idempotent bookmark toggle → { saved }.
//
// Stored in `Like`, which is polymorphic (userId + targetType + targetId, unique
// together) and already carries 'feed' and 'post'. A save is the same shape as a
// like, so this needs no new table and therefore no migration against the live
// database. Every query that counts likes filters on targetType, so these rows
// can never inflate a like count. If saves ever need their own fields, they can
// move to a dedicated table by copying the rows out.
router.post('/:id/save', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub, targetId = req.params.id;
    const post = await prisma.post.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const key = { userId_targetType_targetId: { userId, targetType: SAVE_TYPE, targetId } };
    const existing = await prisma.like.findUnique({ where: key });

    let saved;
    if (existing) { await prisma.like.delete({ where: key }); saved = false; }
    else { await prisma.like.create({ data: { userId, targetType: SAVE_TYPE, targetId } }); saved = true; }

    res.json({ saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    // Only on the way ON — unliking is not an event anyone wants pushed.
    if (liked && post.authorId && post.authorId !== userId) {
      const actor = await resolveAuthor(req, 'Someone');
      await safeNotify(() => notifyUsers([post.authorId], {
        type: 'like',
        title: 'New like',
        message: `${actor.authorName} liked your post`,
        data: { postId: post.id },
      }));
    }
    res.json({ post, liked, likes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
