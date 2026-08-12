// Append-only audit trail for everything that puts a match on air (spec §18).
//
// Every write is fire-and-forget: an audit failure must never be the reason a
// scorer can't stop a broadcast. That is the correct trade for *this* log —
// it exists to answer "who did that, and when" after the fact, not to gate the
// action. It is deliberately never read back into a decision path.

import { prisma } from './prisma.js';

export const AUDIT = {
  SESSION_CREATED: 'SESSION_CREATED',
  PAIR_ATTEMPT_FAILED: 'PAIR_ATTEMPT_FAILED',
  PAIR_REQUESTED: 'PAIR_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  STREAM_STARTED: 'STREAM_STARTED',
  STREAM_ENDED: 'STREAM_ENDED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  ADMIN_FORCE_STOP: 'ADMIN_FORCE_STOP',
  ROLE_GRANTED: 'ROLE_GRANTED',
  ROLE_REVOKED: 'ROLE_REVOKED',
  OVERLAY_TOKEN_ROTATED: 'OVERLAY_TOKEN_ROTATED',
};

/**
 * Record an action. `req` is optional and only used to capture request
 * metadata — pass it where you have it.
 */
export function audit({ matchId, sessionId = null, userId = null, action, detail = null, req = null }) {
  const row = {
    matchId,
    broadcastSessionId: sessionId,
    userId,
    action,
    detail: detail ?? undefined,
    // Vercel sits behind a proxy, so the socket address is the proxy's. The
    // left-most x-forwarded-for entry is the client — everything after it is
    // infrastructure. Both are spoofable by the client; this is a breadcrumb
    // for an investigation, never an authorization input.
    ip: req ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 512) || null : null,
  };

  return prisma.broadcastAuditLog
    .create({ data: row })
    .catch((e) => console.error('[broadcast-audit] write failed:', action, e.message));
}
