import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  // Scope to the active sport; unscoped requests still get everything.
  const { sport } = req.query;
  const clubs = await prisma.club.findMany({
    where: sport ? { sport: String(sport) } : {},
    orderBy: { createdAt: 'desc' },
  });
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

// Writes require a signed-in caller. Both of these were completely open: no
// authMiddleware anywhere in this file, so anyone who could reach the API could
// create a club or rewrite any existing one by id — name, contact details, the
// lot — without an account.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = ClubSchema.parse(req.body);
    const club = await prisma.club.create({ data });
    res.status(201).json({ club });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Signed-in only. It cannot check OWNERSHIP: Club has no ownerId/createdBy
// column, so there is nothing to compare req.user.sub against. Any signed-in
// user can still edit any club — narrowing that needs a schema change and a
// migration, which is a deliberate decision rather than a drive-by.
router.put('/:id', authMiddleware, async (req, res) => {
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
