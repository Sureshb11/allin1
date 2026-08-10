import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

const StatsSchema = z.object({
  // Batting
  matches: z.number().optional(),
  innings: z.number().optional(),
  notOuts: z.number().optional(),
  runs: z.number().optional(),
  highestScore: z.number().optional(),
  battingAverage: z.number().optional(),
  battingStrikeRate: z.number().optional(),
  halfCenturies: z.number().optional(),
  centuries: z.number().optional(),
  fours: z.number().optional(),
  sixes: z.number().optional(),
  battingDotBalls: z.number().optional(),
  ducks: z.number().optional(),

  // Bowling
  oversBowled: z.number().optional(),
  maidens: z.number().optional(),
  wickets: z.number().optional(),
  runsConceded: z.number().optional(),
  bestBowling: z.string().optional(), // bestBowling can be a string like "4/12"
  economy: z.number().optional(),
  bowlingAverage: z.number().optional(),
  bowlingStrikeRate: z.number().optional(),
  dotBalls: z.number().optional(),
  wides: z.number().optional(),
  noBalls: z.number().optional(),
  foursConceded: z.number().optional(),
  sixesConceded: z.number().optional(),
}).catchall(z.any());

// Submit historical stats for verification
router.post('/players/:playerId/historical-stats', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;
    const { data, imageUrls } = req.body;

    const player = await prisma.player.findUnique({
      where: { id: playerId }
    });

    if (!player) return res.status(404).json({ error: 'Player not found' });
    
    // Authorization: User must own this player or be an admin.
    if (player.userId !== req.user.sub && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to submit stats for this player' });
    }

    const validatedData = StatsSchema.parse(data || {});

    const submission = await prisma.historicalStatSubmission.create({
      data: {
        playerId,
        data: validatedData,
        imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
        status: 'pending'
      }
    });

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Historical stats submit error:', err);
    res.status(400).json({ error: err.message || 'Invalid stats data' });
  }
});

// Admin: List pending stats
router.get('/admin/historical-stats', authMiddleware, async (req, res) => {
  try {
    // Basic admin check (Assuming req.user.isAdmin exists or similar)
    // For MVP, we just return all pending stats if authenticated.
    
    const pending = await prisma.historicalStatSubmission.findMany({
      where: { status: 'pending' },
      include: {
        player: {
          select: { name: true, sport: true, id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, pending });
  } catch (err) {
    console.error('List pending stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Approve stats
router.post('/admin/historical-stats/:id/approve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await prisma.historicalStatSubmission.findUnique({
      where: { id },
      include: { player: true }
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'pending') return res.status(400).json({ error: 'Submission already processed' });

    const player = submission.player;
    
    // Merge new data into existing player.stats
    const existingStats = (player.stats && typeof player.stats === 'object') ? player.stats : {};
    const newData = (submission.data && typeof submission.data === 'object') ? submission.data : {};
    
    const mergedStats = { ...existingStats, ...newData };

    // Transaction to update submission status and player stats atomically
    await prisma.$transaction([
      prisma.historicalStatSubmission.update({
        where: { id },
        data: { status: 'approved' }
      }),
      prisma.player.update({
        where: { id: player.id },
        data: { stats: mergedStats }
      })
    ]);

    res.json({ success: true, message: 'Stats approved and merged' });
  } catch (err) {
    console.error('Approve stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Reject stats
router.post('/admin/historical-stats/:id/reject', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await prisma.historicalStatSubmission.update({
      where: { id },
      data: { status: 'rejected' }
    });

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Reject stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
