// devices.js — FCM device-token registration.
//
// The app posts its token after the user grants notification permission, and
// again whenever FCM rotates it. Tokens are unique per install: if one is
// already on file for a different account (shared device, or a re-login), it is
// reassigned rather than duplicated, so a push only ever reaches whoever is
// currently signed in on that device.

import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const RegisterSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['android', 'ios']).optional(),
});

router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { token, platform = 'android' } = RegisterSchema.parse(req.body);
    const device = await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.user.sub, platform },   // re-login on a shared device
      create: { token, platform, userId: req.user.sub },
      select: { id: true, platform: true },
    });
    res.json({ device });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Called on sign-out so the next person on this device doesn't get their pushes.
router.post('/unregister', authMiddleware, async (req, res) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    await prisma.deviceToken.deleteMany({ where: { token, userId: req.user.sub } });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
