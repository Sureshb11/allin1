// Pairing credentials for a broadcast session (spec §3).
//
// Three separate secrets, because they are trusted differently:
//
//   pairing token  — 256 bits, carried in the QR. The real credential.
//   pairing code   — 6 digits, typed by hand when the camera can't scan. Only
//                    ~20 bits, so it survives on a short TTL + a hard attempt
//                    cap + an authenticated, capability-gated caller. Never
//                    treat it as equivalent to the token.
//   overlay token  — 256 bits, read-only. Lives in an OBS browser-source URL,
//                    which is a place secrets go to die (it sits in a config
//                    file, gets screen-shared, and ends up in stream metadata),
//                    so it grants exactly one thing: read this match's score.
//
// Tokens are stored as SHA-256 digests. A plain digest is right here where a
// password hash would not be: these are 256-bit random values with a lifetime
// measured in minutes, so there is no dictionary to attack and nothing that
// slow hashing would buy — and lookup has to be a single indexed query.

import crypto from 'crypto';

/** Minutes a pairing token stays valid. The spec's QR screen counts down 3:00. */
export const PAIRING_TTL_MINUTES = 3;

/** Wrong-code guesses before the session is burned. */
export const MAX_PAIR_ATTEMPTS = 5;

export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * A 6-digit code, uniformly distributed. `randomInt` is rejection-sampled by
 * node, so this has none of the modulo bias of `randomBytes % 1000000`.
 */
export function generatePairingCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function tokenExpiry(from = new Date()) {
  return new Date(from.getTime() + PAIRING_TTL_MINUTES * 60_000);
}

export function isExpired(expiresAt) {
  return !expiresAt || new Date(expiresAt).getTime() <= Date.now();
}

/**
 * What the QR actually carries. Note what is absent: no JWT, no stream key, no
 * YouTube id, no user id — scanning this in a crowd tells you nothing and gets
 * you nowhere without a Local Legends login that already holds the BROADCASTER
 * capability. The match id is included only so the broadcaster's app can show
 * "Chennai Kings vs Mumbai Warriors" on the confirm screen (spec §4).
 */
export function qrPayload({ sessionId, matchId, token }) {
  return JSON.stringify({ v: 1, t: 'll-broadcast-pair', sid: sessionId, mid: matchId, tok: token });
}

export function parseQrPayload(raw) {
  try {
    const p = JSON.parse(raw);
    if (p?.t !== 'll-broadcast-pair' || !p?.tok) return null;
    return { sessionId: p.sid, matchId: p.mid, token: p.tok };
  } catch {
    return null;
  }
}
