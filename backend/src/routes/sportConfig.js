// /sports/config — serves the polymorphic SportConfiguration rules so the
// frontend renders the correct scoring UI per sport from data, not bundled
// code. Editing a row (or `node prisma/seedSportConfig.js`) changes a sport's
// periods/actions/rules with no app release.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// All configs (frontend hydrates its cache once from this).
router.get('/config', async (_req, res) => {
  try {
    const rows = await prisma.sportConfiguration.findMany({ orderBy: { id: 'asc' } });
    res.json({ configs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// One sport's config.
router.get('/:id/config', async (req, res) => {
  try {
    const row = await prisma.sportConfiguration.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'No config for that sport' });
    res.json({ config: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin upsert — edit a sport's rules at runtime (auth-gated).
const UpsertSchema = z.object({
  name:   z.string().min(1),
  icon:   z.string().optional(),
  color:  z.string().optional(),
  accent: z.string().optional(),
  rules:  z.any(),
});
router.put('/:id/config', authMiddleware, async (req, res) => {
  try {
    const data = UpsertSchema.parse(req.body);
    const row = await prisma.sportConfiguration.upsert({
      where: { id: req.params.id },
      create: { id: req.params.id, ...data },
      update: { ...data, version: { increment: 1 } },
    });
    res.json({ config: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
