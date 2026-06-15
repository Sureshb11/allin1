import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';

const router = Router();

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

router.post('/signup', async (req, res) => {
  try {
    const data = SignupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { ...data, passwordHash }
    });
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Mobile OTP Auth ──────────────────────────────────────────────────
// Mock implementation: OTP is always 1234
// TODO: Replace with real SMS OTP provider (e.g. Twilio, MSG91)

const SendOtpSchema = z.object({
  phone: z.string().min(10),
  countryCode: z.string().default('+91'),
});

router.post('/send-otp', async (req, res) => {
  try {
    const { phone, countryCode } = SendOtpSchema.parse(req.body);
    // In production: send real SMS here
    console.log(`[MOCK OTP] Sending OTP 1234 to ${countryCode}${phone}`);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const VerifyOtpSchema = z.object({
  phone: z.string().min(10),
  countryCode: z.string().default('+91'),
  otp: z.string().length(4),
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, countryCode, otp } = VerifyOtpSchema.parse(req.body);

    // Mock OTP check — accept 1234
    if (otp !== '1234') {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    const fullPhone = `${countryCode}${phone}`;

    // Find or create user by phone
    let user = await prisma.user.findUnique({ where: { phone: fullPhone } });

    if (!user) {
      // Auto-register on first OTP login
      const dummyHash = await bcrypt.hash('otp-user-no-password', 10);
      user = await prisma.user.create({
        data: {
          phone: fullPhone,
          email: `${phone}@otp.local`, // placeholder email
          firstName: 'User',
          lastName: phone.slice(-4),
          passwordHash: dummyHash,
        },
      });
    }

    const token = signToken({ sub: user.id, phone: fullPhone });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
      },
      isNewUser: !user.bio, // hint for frontend to show onboarding
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
