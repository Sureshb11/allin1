import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

// List all videos
router.get('/', async (req, res) => {
  const videos = await prisma.video.findMany({
    include: { analysis: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ videos });
});

// Get single video with analysis
router.get('/:id', async (req, res) => {
  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: { analysis: true },
  });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json({ video });
});

const VideoSchema = z.object({
  title: z.string().min(1),
  matchId: z.string().optional(),
  uploadUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  duration: z.string().optional(),
});

// Upload video metadata
router.post('/', async (req, res) => {
  try {
    const data = VideoSchema.parse(req.body);
    const video = await prisma.video.create({ data });
    res.status(201).json({ video });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Trigger analysis (mock - generates placeholder insights)
router.post('/:id/analyze', async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    await prisma.video.update({
      where: { id: req.params.id },
      data: { status: 'analyzing' },
    });

    // Simulate analysis (in production this would be an async job)
    const analysis = await prisma.videoAnalysis.upsert({
      where: { videoId: req.params.id },
      create: {
        videoId: req.params.id,
        highlights: Math.floor(Math.random() * 10) + 3,
        shots: Math.floor(Math.random() * 30) + 10,
        insights: Math.floor(Math.random() * 8) + 2,
        details: {
          battingTechnique: 'Good front foot movement',
          bowlingAnalysis: 'Consistent line and length',
          fieldingHighlights: 'Sharp catching in slips',
        },
      },
      update: {
        highlights: Math.floor(Math.random() * 10) + 3,
        shots: Math.floor(Math.random() * 30) + 10,
        insights: Math.floor(Math.random() * 8) + 2,
      },
    });

    await prisma.video.update({
      where: { id: req.params.id },
      data: { status: 'analyzed' },
    });

    res.json({ success: true, analysis });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get analyses
router.get('/analyses/all', async (req, res) => {
  const analyses = await prisma.videoAnalysis.findMany({
    include: { video: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ analyses });
});

export default router;
