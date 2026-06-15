import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const streams = await prisma.stream.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ streams });
});

const StreamSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  matchId: z.string().optional(),
  channel: z.string().min(1),
  isPrivate: z.boolean().default(false),
  quality: z.string().min(1),
});

router.post('/', async (req, res) => {
  try {
    const data = StreamSchema.parse(req.body);
    const stream = await prisma.stream.create({ data });
    res.status(201).json({ stream });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
