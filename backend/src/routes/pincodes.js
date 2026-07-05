import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// Title-case ALL-CAPS district/state names for nicer display.
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// GET /pincodes/search?q=chenn  → up to 12 matching localities.
// Numeric q → search by pincode prefix; otherwise by office (city/town) prefix.
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const numeric = /^\d+$/.test(q);
    const rows = numeric
      ? await prisma.$queryRawUnsafe(
          `SELECT office, pincode, district, state FROM "Pincode" WHERE pincode LIKE $1 ORDER BY office LIMIT 12`,
          `${q}%`,
        )
      : await prisma.$queryRawUnsafe(
          `SELECT office, pincode, district, state FROM "Pincode" WHERE upper(office) LIKE $1 ORDER BY office LIMIT 12`,
          `${q.toUpperCase()}%`,
        );
    const results = rows.map((r) => ({
      city: r.office,
      pincode: r.pincode,
      district: titleCase(r.district),
      state: titleCase(r.state),
      country: 'India',
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
