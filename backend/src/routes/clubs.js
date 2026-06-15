import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  const clubs = await prisma.club.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ clubs });
});

router.get('/:id', async (req, res) => {
  const club = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!club) return res.status(404).json({ error: 'Club not found' });
  res.json({ club });
});

const ClubSchema = z.object({
  name: z.string().min(1),
  president: z.string().optional(),
  secretary: z.string().optional(),
  foundedYear: z.number().int().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  membershipFee: z.string().optional(),
  facilities: z.any().optional(),
  bio: z.string().optional(),
});

router.post('/', async (req, res) => {
  try {
    const data = ClubSchema.parse(req.body);
    const club = await prisma.club.create({ data });
    res.status(201).json({ club });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = ClubSchema.partial().parse(req.body);
    const club = await prisma.club.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ club });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
