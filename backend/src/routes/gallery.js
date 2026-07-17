import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { isTeamAdmin } from '../lib/teamAuth.js';

const router = express.Router();

// GET /gallery?userId=…  or  ?teamId=…  → photos, newest first.
router.get('/', async (req, res) => {
  try {
    const { userId, teamId } = req.query;
    if (!userId && !teamId) return res.json({ photos: [] });
    const where = userId ? { userId: String(userId) } : { teamId: String(teamId) };
    const photos = await prisma.galleryPhoto.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60 });
    res.json({ photos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /gallery  { url, caption?, teamId? }  → adds to the caller's gallery (or a
// team's). Adding to a TEAM gallery requires being a team admin.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { url, caption, teamId } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    if (teamId && !(await isTeamAdmin(teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can add team photos' });
    }
    const photo = await prisma.galleryPhoto.create({
      data: { url, caption: caption || null, teamId: teamId || null, userId: teamId ? null : req.user.sub },
    });
    res.status(201).json({ photo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /gallery/:id  → a personal photo can be removed by its owner; a TEAM
// photo can be removed by any team admin.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const photo = await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } });
    if (!photo) return res.status(404).json({ error: 'Not found' });
    if (photo.teamId) {
      if (!(await isTeamAdmin(photo.teamId, req.user.sub))) {
        return res.status(403).json({ error: 'Only a team admin can remove team photos' });
      }
    } else if (photo.userId && photo.userId !== req.user.sub) {
      return res.status(403).json({ error: 'Not yours' });
    }
    await prisma.galleryPhoto.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
