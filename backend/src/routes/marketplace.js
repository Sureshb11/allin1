import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/products', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ products });
});

const ProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().nonnegative(),
  category: z.string().min(1),
  location: z.string().optional(),
  images: z.any().optional(),
});

router.post('/products', authMiddleware, async (req, res) => {
  try {
    const data = ProductSchema.parse(req.body);
    const product = await prisma.product.create({ data: { ...data, sellerId: req.user.sub } });
    res.status(201).json({ product });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get single product
router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { seller: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
