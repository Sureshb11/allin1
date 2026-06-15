import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const news = await prisma.news.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ news });
});

const NewsSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  author: z.string().optional(),
  category: z.string().optional(),
});

router.post('/', async (req, res) => {
  try {
    const data = NewsSchema.parse(req.body);
    const item = await prisma.news.create({ data });
    res.status(201).json({ news: item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
