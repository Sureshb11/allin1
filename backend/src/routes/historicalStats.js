import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { extractStatsFromImages } from '../lib/gemini.js';
import { put } from '@vercel/blob';
import { notifyUsers } from '../lib/notify.js';

const router = express.Router();

const StatsSchema = z.object({
  // Batting
  matches: z.number().optional(),
  battingInnings: z.number().optional(),
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
  bowlingInnings: z.number().optional(),
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

// Get latest historical stats submission status for a player
router.get('/players/:playerId/historical-stats/status', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;

    const submission = await prisma.historicalStatSubmission.findFirst({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, adminNote: true }
    });

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Get stats status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit historical stats for verification
router.post('/players/:playerId/historical-stats', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;
    const { data, imageUrls, ballType = 'overall' } = req.body;

    const player = await prisma.player.findUnique({
      where: { id: playerId }
    });

    if (!player) return res.status(404).json({ error: 'Player not found' });
    
    // Authorization: User must own this player or be an admin.
    if (player.userId !== req.user.sub && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to submit stats for this player' });
    }

    const validatedData = StatsSchema.parse(data || {});
    validatedData.ballType = ballType; // Save the ballType selected by user

    // Handle Vercel Blob Uploads
    const finalImageUrls = [];
    if (Array.isArray(imageUrls)) {
      for (let i = 0; i < imageUrls.length; i++) {
        const img = imageUrls[i];
        if (img && typeof img === 'object' && img.base64) {
          try {
            const buffer = Buffer.from(img.base64, 'base64');
            const ext = img.type?.split('/')[1] || 'jpeg';
            const filename = `stats-proof-${playerId}-${Date.now()}-${i}.${ext}`;
            const { url } = await put(filename, buffer, { access: 'public' });
            finalImageUrls.push(url);
          } catch (uploadErr) {
            console.error('Failed to upload image to Blob:', uploadErr);
          }
        } else if (typeof img === 'string') {
          // Fallback if it's already a URL
          finalImageUrls.push(img);
        }
      }
    }

    const submission = await prisma.historicalStatSubmission.create({
      data: {
        playerId,
        data: validatedData,
        imageUrls: finalImageUrls,
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
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
    }
    
    const pending = await prisma.historicalStatSubmission.findMany({
      where: { status: 'pending' },
      include: {
        player: {
          select: { name: true, sport: true, id: true, userId: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by sport
    const grouped = {};
    pending.forEach(sub => {
      const sport = sub.player.sport || 'cricket';
      if (!grouped[sport]) grouped[sport] = { sport, count: 0, submissions: [] };
      grouped[sport].count++;
      grouped[sport].submissions.push(sub);
    });

    res.json({ success: true, data: Object.values(grouped), totalPending: pending.length });
  } catch (err) {
    console.error('List pending stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Approve stats
router.post('/admin/historical-stats/:id/approve', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
    }
    const { id } = req.params;
    const { editedData } = req.body;
    
    const submission = await prisma.historicalStatSubmission.findUnique({
      where: { id },
      include: { player: true }
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'pending') return res.status(400).json({ error: 'Submission already processed' });

    const player = submission.player;
    
    // Merge new data into existing player.stats
    const existingStats = (player.stats && typeof player.stats === 'object') ? player.stats : {};
    let newData = (editedData && typeof editedData === 'object') ? editedData : ((submission.data && typeof submission.data === 'object') ? submission.data : {});
    
    // Extract ballType and remove it from the stats payload
    const ballType = newData.ballType || (submission.data && submission.data.ballType) || 'overall';
    if (newData.ballType) delete newData.ballType;
    
    let mergedStats = { ...existingStats };
    if (ballType === 'leather' || ballType === 'tennis' || ballType === 'indoor') {
      mergedStats[ballType] = { ...(existingStats[ballType] || {}), ...newData };
    } else {
      mergedStats = { ...existingStats, ...newData };
    }

    // Transaction to update submission status and player stats atomically
    await prisma.$transaction([
      prisma.historicalStatSubmission.update({
        where: { id },
        data: { 
          status: 'approved',
          data: newData // Save the final approved data
        }
      }),
      prisma.player.update({
        where: { id: player.id },
        data: { stats: mergedStats }
      })
    ]);

    // Send push notification
    if (player.userId) {
      await notifyUsers([player.userId], {
        type: 'stats',
        title: 'Stats Verified! 🎉',
        message: 'Your past scorecards have been verified and added to your profile.',
      }).catch(e => console.error('Push notification failed:', e));
    }

    res.json({ success: true, message: 'Stats approved and merged' });
  } catch (err) {
    console.error('Approve stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Reject stats
router.post('/admin/historical-stats/:id/reject', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
    }
    
    const { id } = req.params;
    const { adminNote } = req.body;
    
    // We need the player's userId for the notification
    const existingSub = await prisma.historicalStatSubmission.findUnique({
      where: { id },
      include: { player: true }
    });

    if (!existingSub) return res.status(404).json({ error: 'Submission not found' });

    const submission = await prisma.historicalStatSubmission.update({
      where: { id },
      data: { 
        status: 'rejected',
        adminNote: adminNote || null
      }
    });

    // Send push notification
    if (existingSub.player?.userId) {
      await notifyUsers([existingSub.player.userId], {
        type: 'stats',
        title: 'Stats Upload Rejected ⚠️',
        message: adminNote || 'There was an issue with your scorecard upload. Please try again.',
      }).catch(e => console.error('Push notification failed:', e));
    }

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Reject stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Extract stats via AI
router.post('/admin/historical-stats/:id/extract', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
    }
    
    const { id } = req.params;
    const submission = await prisma.historicalStatSubmission.findUnique({
      where: { id }
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (!submission.imageUrls || submission.imageUrls.length === 0) {
      return res.status(400).json({ error: 'No images available to extract from' });
    }

    const extractedData = await extractStatsFromImages(submission.imageUrls);

    // Save the extracted data back to the pending submission so we don't lose it
    const updatedSubmission = await prisma.historicalStatSubmission.update({
      where: { id },
      data: { data: extractedData }
    });

    res.json({ success: true, submission: updatedSubmission, extractedData });
  } catch (err) {
    console.error('Extract stats error:', err);
    res.status(500).json({ error: err.message || 'Server error during extraction' });
  }
});

export default router;
