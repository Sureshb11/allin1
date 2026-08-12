// Live Telecast — broadcast session lifecycle (spec §3, §4, §5, §6, §17, §21).
//
// Mounted at /broadcast. The match-scoped setup routes live here too rather
// than in matches.js, so that everything that can put a match on air is in one
// file and can be read as a whole.
//
// Session state machine:
//
//   PENDING ──pair──▶ PENDING(requested) ──approve──▶ APPROVED ──config──▶ CONNECTED
//      │                      │                                                │
//      │                      └──reject──▶ REJECTED                         start
//      │                                                                       │
//      └──expiry──▶ EXPIRED                                                    ▼
//                                                          PAUSED ◀──pause── LIVE
//   any active state ──revoke──▶ REVOKED                                       │
//                                                                    end/complete
//                                                                              ▼
//                                                                            ENDED
//
// One deliberate deviation from the spec, documented rather than silent: §5
// says approval sets the session to CONNECTED. Here approval sets APPROVED and
// the session becomes CONNECTED when the broadcaster actually fetches its
// stream configuration. The spec's own §6 defines both states, and splitting
// them is what lets a scorer see the difference between "I approved them" and
// "their encoder is actually talking to us" — which is the question they will
// have thirty seconds before the first ball.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { isAdmin, requireAdmin } from '../lib/adminAuth.js';
import {
  ROLE,
  BROADCAST_STATUS,
  ACTIVE_BROADCAST_STATUSES,
  hasCapability,
  canControlBroadcast,
  requireBroadcastControl,
  assertSessionUsable,
  findActiveSession,
} from '../lib/broadcastAuth.js';
import { audit, AUDIT } from '../lib/broadcastAudit.js';
import {
  generateToken,
  hashToken,
  generatePairingCode,
  tokenExpiry,
  isExpired,
  qrPayload,
  parseQrPayload,
  MAX_PAIR_ATTEMPTS,
  PAIRING_TTL_MINUTES,
} from '../lib/pairing.js';

const router = Router();

/** What a session looks like to a client. Never leaks a hash or a token. */
function publicSession(s, { includeCode = false } = {}) {
  if (!s) return null;
  return {
    id: s.id,
    matchId: s.matchId,
    status: s.status,
    broadcasterUserId: s.broadcasterUserId,
    pairingCode: includeCode ? s.pairingCode : undefined,
    tokenExpiresAt: includeCode ? s.tokenExpiresAt : undefined,
    youtubeVideoId: s.youtubeVideoId,
    requestedAt: s.requestedAt,
    connectedAt: s.connectedAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    lastHeartbeatAt: s.lastHeartbeatAt,
    createdAt: s.createdAt,
  };
}

/**
 * Serverless has no cron, so expiry is evaluated on read. A PENDING session
 * whose token has run out is flipped to EXPIRED the next time anyone looks at
 * it — which is always before it could be used, because every path that uses a
 * session goes through a read first.
 */
async function expireIfStale(session) {
  if (!session) return session;
  const unpaired = session.status === BROADCAST_STATUS.PENDING && !session.broadcasterUserId;
  if (unpaired && isExpired(session.tokenExpiresAt)) {
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { status: BROADCAST_STATUS.EXPIRED, pairingCode: null, pairingTokenHash: null },
    });
    audit({ matchId: session.matchId, sessionId: session.id, action: AUDIT.EXPIRED });
    return updated;
  }
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — scorer/organizer side
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /broadcast/matches/:matchId/sessions
 * Start broadcast setup: mint a session + QR + 6-digit code (spec §3).
 *
 * The token is returned exactly once, here, in the response body. It is stored
 * only as a hash, so it cannot be re-read later — re-opening the QR screen
 * after this rotates a fresh one.
 */
router.post('/matches/:matchId/sessions', authMiddleware, requireBroadcastControl, async (req, res, next) => {
  try {
    const match = req.match;
    const gate = assertSessionUsable({ status: BROADCAST_STATUS.PENDING }, match, { intent: 'pair' });
    if (gate) return res.status(gate.status).json({ error: gate.error });

    const token = generateToken();
    const code = generatePairingCode();
    const expiresAt = tokenExpiry();

    // The uniqueness check and the insert share one transaction, so two scorers
    // tapping "Start Broadcast Setup" at the same instant cannot both win.
    const session = await prisma.$transaction(async (tx) => {
      const existing = await findActiveSession(match.id, tx);
      if (existing) {
        // Re-issuing while a session is merely waiting to be paired is normal
        // (the code timed out on screen). Re-issuing over a *live* broadcast is
        // not — that would orphan a stream that is currently on air.
        if (existing.status !== BROADCAST_STATUS.PENDING || existing.broadcasterUserId) {
          const err = new Error(`A broadcast is already ${existing.status} for this match`);
          err.httpStatus = 409;
          throw err;
        }
        await tx.broadcastSession.update({
          where: { id: existing.id },
          data: { status: BROADCAST_STATUS.EXPIRED, pairingTokenHash: null, pairingCode: null },
        });
      }

      return tx.broadcastSession.create({
        data: {
          matchId: match.id,
          status: BROADCAST_STATUS.PENDING,
          pairingCode: code,
          pairingTokenHash: hashToken(token),
          tokenExpiresAt: expiresAt,
          createdBy: req.user.sub,
        },
      });
    });

    audit({ matchId: match.id, sessionId: session.id, userId: req.user.sub, action: AUDIT.SESSION_CREATED, req });

    res.status(201).json({
      session: publicSession(session, { includeCode: true }),
      // Shown once. The client renders this string as the QR image.
      qr: qrPayload({ sessionId: session.id, matchId: match.id, token }),
      expiresInSeconds: PAIRING_TTL_MINUTES * 60,
    });
  } catch (e) {
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    next(e);
  }
});

/** GET /broadcast/matches/:matchId/session — current session, for the scorer's screen. */
router.get('/matches/:matchId/session', authMiddleware, requireBroadcastControl, async (req, res, next) => {
  try {
    let session = await findActiveSession(req.params.matchId);
    session = await expireIfStale(session);

    let broadcaster = null;
    if (session?.broadcasterUserId) {
      broadcaster = await prisma.user.findUnique({
        where: { id: session.broadcasterUserId },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      });
    }
    res.json({ session: publicSession(session, { includeCode: true }), broadcaster });
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pairing — broadcaster side (spec §4)
// ─────────────────────────────────────────────────────────────────────────────

const PairSchema = z.object({ qr: z.string().optional(), code: z.string().length(6).optional() })
  .refine((d) => d.qr || d.code, { message: 'Provide a scanned QR payload or a 6-digit code' });

/**
 * POST /broadcast/pair
 * Consumes a pairing credential and files a join request. Does NOT start
 * streaming — the spec is explicit that approval is a separate human step.
 */
router.post('/pair', authMiddleware, async (req, res, next) => {
  try {
    const body = PairSchema.parse(req.body);

    // Gate 1: an authenticated account is not enough — you must hold the
    // app-wide BROADCASTER capability (spec §17). This is also what makes the
    // 6-digit code safe to accept: guessing it requires an approved account,
    // and every wrong guess is attributed to that account.
    if (!(await hasCapability(req.user.sub, ROLE.BROADCASTER))) {
      return res.status(403).json({ error: 'Your account is not approved to broadcast' });
    }

    let session = null;
    if (body.qr) {
      const parsed = parseQrPayload(body.qr);
      if (!parsed) return res.status(400).json({ error: 'Unrecognised QR code' });
      session = await prisma.broadcastSession.findUnique({
        where: { pairingTokenHash: hashToken(parsed.token) },
      });
    } else {
      // Code path: scoped to sessions still awaiting a broadcaster, so a stale
      // code cannot collide with a live session's row.
      session = await prisma.broadcastSession.findFirst({
        where: {
          pairingCode: body.code,
          status: BROADCAST_STATUS.PENDING,
          broadcasterUserId: null,
          tokenExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!session) {
      audit({ matchId: 'unknown', userId: req.user.sub, action: AUDIT.PAIR_ATTEMPT_FAILED, req });
      return res.status(404).json({ error: 'That pairing code is not valid' });
    }

    session = await expireIfStale(session);
    if (session.status !== BROADCAST_STATUS.PENDING || session.broadcasterUserId) {
      return res.status(409).json({ error: 'That pairing code has already been used' });
    }
    if (isExpired(session.tokenExpiresAt)) {
      return res.status(410).json({ error: 'That pairing code has expired' });
    }
    if (session.pairAttempts >= MAX_PAIR_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts — ask the scorer for a new code' });
    }

    const match = await prisma.match.findUnique({ where: { id: session.matchId } });
    const gate = assertSessionUsable(session, match, { intent: 'pair' });
    if (gate) return res.status(gate.status).json({ error: gate.error });

    // Single-use: the token hash and the code are cleared as they are consumed,
    // inside a conditional update. The `pairingTokenHash: session.pairingTokenHash`
    // predicate makes this a compare-and-swap — two broadcasters racing the same
    // QR produce one winner and one 409, without a transaction.
    const claimed = await prisma.broadcastSession.updateMany({
      where: { id: session.id, broadcasterUserId: null, status: BROADCAST_STATUS.PENDING },
      data: {
        broadcasterUserId: req.user.sub,
        requestedAt: new Date(),
        pairingTokenHash: null,
        pairingCode: null,
      },
    });
    if (claimed.count === 0) {
      return res.status(409).json({ error: 'That pairing code has already been used' });
    }

    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.PAIR_REQUESTED, req });

    const [team1, team2] = await Promise.all([
      prisma.team.findUnique({ where: { id: match.team1Id }, select: { name: true, logoUrl: true } }),
      prisma.team.findUnique({ where: { id: match.team2Id }, select: { name: true, logoUrl: true } }),
    ]);

    res.json({
      session: publicSession(await prisma.broadcastSession.findUnique({ where: { id: session.id } })),
      // The confirm screen in spec §4 — enough to recognise the match, nothing
      // that would be sensitive if the wrong person scanned it.
      match: { id: match.id, venue: match.venue, startTime: match.startTime, team1, team2 },
      awaitingApproval: true,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    next(e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Approval (spec §5)
// ─────────────────────────────────────────────────────────────────────────────

/** Load a session + its match, 404ing together. */
async function loadSession(id) {
  const session = await prisma.broadcastSession.findUnique({ where: { id } });
  if (!session) return {};
  const match = await prisma.match.findUnique({ where: { id: session.matchId } });
  return { session, match };
}

router.post('/sessions/:id/approve', authMiddleware, async (req, res, next) => {
  try {
    const { session, match } = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Broadcast session not found' });
    if (!(await canControlBroadcast(req.user.sub, session.matchId))) {
      return res.status(403).json({ error: 'Not authorized to approve this broadcast' });
    }
    const gate = assertSessionUsable(session, match, { intent: 'pair' });
    if (gate) return res.status(gate.status).json({ error: gate.error });
    if (!session.broadcasterUserId) {
      return res.status(409).json({ error: 'No broadcaster has requested this session yet' });
    }
    if (session.status !== BROADCAST_STATUS.PENDING) {
      return res.status(409).json({ error: `Session is already ${session.status}` });
    }

    // The overlay token is minted at approval, not at session creation: until
    // someone is approved there is nothing to overlay onto.
    const overlayToken = generateToken();
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        status: BROADCAST_STATUS.APPROVED,
        overlayTokenHash: hashToken(overlayToken),
      },
    });

    // Grant the match-scoped BROADCASTER role so authorization survives the
    // session — an approved operator who reconnects is still approved.
    await prisma.matchRole.upsert({
      where: {
        matchId_userId_role: { matchId: session.matchId, userId: session.broadcasterUserId, role: ROLE.BROADCASTER },
      },
      create: {
        matchId: session.matchId,
        userId: session.broadcasterUserId,
        role: ROLE.BROADCASTER,
        grantedBy: req.user.sub,
      },
      update: { status: 'ACTIVE', grantedBy: req.user.sub },
    });

    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.APPROVED, req });

    res.json({
      session: publicSession(updated),
      // Returned once, to the approver, for the overlay browser-source URL.
      overlayUrl: `${req.protocol}://${req.get('host')}/overlay/${session.id}?token=${overlayToken}`,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/sessions/:id/reject', authMiddleware, async (req, res, next) => {
  try {
    const { session } = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Broadcast session not found' });
    if (!(await canControlBroadcast(req.user.sub, session.matchId))) {
      return res.status(403).json({ error: 'Not authorized to reject this broadcast' });
    }
    if (session.status !== BROADCAST_STATUS.PENDING) {
      return res.status(409).json({ error: `Session is already ${session.status}` });
    }
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { status: BROADCAST_STATUS.REJECTED, pairingCode: null, pairingTokenHash: null },
    });
    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.REJECTED, req });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Streaming lifecycle — broadcaster side
// ─────────────────────────────────────────────────────────────────────────────

/** Guard: the caller must BE the approved broadcaster on this session. */
async function requireSessionBroadcaster(req, res) {
  const { session, match } = await loadSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Broadcast session not found' });
    return {};
  }
  if (session.broadcasterUserId !== req.user.sub && !isAdmin(req.user.sub)) {
    res.status(403).json({ error: 'You are not the broadcaster for this session' });
    return {};
  }
  return { session, match };
}

/**
 * POST /broadcast/sessions/:id/connect
 * The broadcaster fetches its streaming configuration. APPROVED → CONNECTED.
 */
router.post('/sessions/:id/connect', authMiddleware, async (req, res, next) => {
  try {
    const { session, match } = await requireSessionBroadcaster(req, res);
    if (!session) return;
    const gate = assertSessionUsable(session, match, { intent: 'pair' });
    if (gate) return res.status(gate.status).json({ error: gate.error });
    if (![BROADCAST_STATUS.APPROVED, BROADCAST_STATUS.CONNECTED].includes(session.status)) {
      return res.status(409).json({ error: `Session is ${session.status}, not approved` });
    }

    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { status: BROADCAST_STATUS.CONNECTED, connectedAt: session.connectedAt ?? new Date() },
    });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

/** POST /broadcast/sessions/:id/start — video is flowing. CONNECTED → LIVE. */
router.post('/sessions/:id/start', authMiddleware, async (req, res, next) => {
  try {
    const { session, match } = await requireSessionBroadcaster(req, res);
    if (!session) return;
    // 'live' intent: the match must actually be on air, not merely ready.
    const gate = assertSessionUsable(session, match, { intent: 'live' });
    if (gate) return res.status(gate.status).json({ error: gate.error });
    if (![BROADCAST_STATUS.CONNECTED, BROADCAST_STATUS.PAUSED].includes(session.status)) {
      return res.status(409).json({ error: `Session is ${session.status}, not connected` });
    }
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { status: BROADCAST_STATUS.LIVE, startedAt: session.startedAt ?? new Date(), lastHeartbeatAt: new Date() },
    });
    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.STREAM_STARTED, req });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /broadcast/sessions/:id/heartbeat
 * Liveness. Cheap by design — this is called every few seconds by a phone on a
 * cricket ground's mobile signal, so it writes one column and returns the
 * session status, which is how a revoked broadcaster learns to stop.
 */
router.post('/sessions/:id/heartbeat', authMiddleware, async (req, res, next) => {
  try {
    const { session } = await requireSessionBroadcaster(req, res);
    if (!session) return;
    if (!ACTIVE_BROADCAST_STATUSES.includes(session.status)) {
      return res.status(409).json({ error: `Session is ${session.status}`, status: session.status, stop: true });
    }
    await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { lastHeartbeatAt: new Date() },
    });
    res.json({ status: session.status, stop: false });
  } catch (e) {
    next(e);
  }
});

/** POST /broadcast/sessions/:id/end — normal finish (spec §21). */
router.post('/sessions/:id/end', authMiddleware, async (req, res, next) => {
  try {
    const { session } = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Broadcast session not found' });
    const isOwner = session.broadcasterUserId === req.user.sub;
    if (!isOwner && !(await canControlBroadcast(req.user.sub, session.matchId))) {
      return res.status(403).json({ error: 'Not authorized to end this broadcast' });
    }
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: { status: BROADCAST_STATUS.ENDED, endedAt: new Date(), overlayTokenHash: null },
    });
    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.STREAM_ENDED, req });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /broadcast/sessions/:id/revoke — scorer/organizer pulls the plug (§17).
 *
 * IMPORTANT, and called out because the spec understates it: this revokes
 * *Local Legends'* authorization. It stops the overlay, fails the next
 * heartbeat, and bars re-connection. It does NOT stop bytes already flowing to
 * an external RTMP endpoint — the stream key is a credential the encoder holds,
 * and nothing in this database can reach it.
 *
 * Until the YouTube integration lands (spec §13, not yet built), revoking is
 * therefore NOT a hard kill: the scorer must also stop the stream at the
 * encoder. Closing that gap requires transitioning the YouTube broadcast to
 * `complete` and rotating the stream key from the server.
 */
router.post('/sessions/:id/revoke', authMiddleware, async (req, res, next) => {
  try {
    const { session } = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Broadcast session not found' });
    if (!(await canControlBroadcast(req.user.sub, session.matchId))) {
      return res.status(403).json({ error: 'Not authorized to revoke this broadcast' });
    }

    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        status: BROADCAST_STATUS.REVOKED,
        revokedAt: new Date(),
        revokedBy: req.user.sub,
        revokeReason: String(req.body?.reason || '').slice(0, 500) || null,
        overlayTokenHash: null,
        pairingTokenHash: null,
        pairingCode: null,
        endedAt: new Date(),
      },
    });

    if (session.broadcasterUserId) {
      await prisma.matchRole.updateMany({
        where: { matchId: session.matchId, userId: session.broadcasterUserId, role: ROLE.BROADCASTER },
        data: { status: 'REVOKED' },
      });
    }

    audit({
      matchId: session.matchId,
      sessionId: session.id,
      userId: req.user.sub,
      action: AUDIT.REVOKED,
      detail: { reason: updated.revokeReason },
      req,
    });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

/** POST /broadcast/sessions/:id/force-stop — admin override (spec §18). */
router.post('/sessions/:id/force-stop', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { session } = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Broadcast session not found' });
    const updated = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        status: BROADCAST_STATUS.REVOKED,
        revokedAt: new Date(),
        revokedBy: req.user.sub,
        revokeReason: String(req.body?.reason || 'Admin force stop').slice(0, 500),
        overlayTokenHash: null,
        endedAt: new Date(),
      },
    });
    audit({ matchId: session.matchId, sessionId: session.id, userId: req.user.sub, action: AUDIT.ADMIN_FORCE_STOP, req });
    res.json({ session: publicSession(updated) });
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability administration (spec §2, §17, §18)
// ─────────────────────────────────────────────────────────────────────────────

const GrantSchema = z.object({
  userId: z.string().min(1),
  role: z.enum([ROLE.BROADCASTER, ROLE.ORGANIZER]),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
  reason: z.string().max(500).optional(),
});

router.post('/roles', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const body = GrantSchema.parse(req.body);
    const row = await prisma.userRole.upsert({
      where: { userId_role: { userId: body.userId, role: body.role } },
      create: { ...body, grantedBy: req.user.sub },
      update: { status: body.status, reason: body.reason, grantedBy: req.user.sub },
    });
    audit({
      matchId: '-',
      userId: req.user.sub,
      action: body.status === 'ACTIVE' ? AUDIT.ROLE_GRANTED : AUDIT.ROLE_REVOKED,
      detail: { targetUserId: body.userId, role: body.role },
      req,
    });
    res.json({ role: row });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    next(e);
  }
});

/** GET /broadcast/me — what may I do? Drives which buttons the app shows. */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const roles = await prisma.userRole.findMany({
      where: { userId: req.user.sub, status: 'ACTIVE' },
      select: { role: true },
    });
    res.json({
      admin: isAdmin(req.user.sub),
      capabilities: roles.map((r) => r.role),
      canBroadcast: await hasCapability(req.user.sub, ROLE.BROADCASTER),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /broadcast/matches/:matchId/audit — the trail (spec §18). */
router.get('/matches/:matchId/audit', authMiddleware, requireBroadcastControl, async (req, res, next) => {
  try {
    const logs = await prisma.broadcastAuditLog.findMany({
      where: { matchId: req.params.matchId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ logs });
  } catch (e) {
    next(e);
  }
});

export default router;
