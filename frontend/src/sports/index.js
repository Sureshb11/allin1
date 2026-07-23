// Sport registry — the single entry point for per-sport config.
//
//   import { getSport, listSports } from '../sports';
//   const sport = getSport('cricket');   // SportDefinition (or null if unknown)
//   sport.scoring / sport.formats / sport.dashboard / sport.find / sport.custom
//
// Order below is the canonical Arena-picker order.

import cricket from './cricket';
import football from './football';
import kabaddi from './kabaddi';
import hockey from './hockey';
import badminton from './badminton';
import tennis from './tennis';
import basketball from './basketball';
import volleyball from './volleyball';
import boxing from './boxing';
import wrestling from './wrestling';
import tabletennis from './tabletennis';
import khokho from './khokho';
import handball from './handball';
import squash from './squash';
import pickleball from './pickleball';
import judo from './judo';
import karate from './karate';
import skateboard from './skateboard';
import rummy from './rummy';

const SPORTS = [
  cricket, football, kabaddi, hockey, badminton, tennis, basketball, volleyball,
  boxing, wrestling, tabletennis, khokho, handball, squash, pickleball, judo,
  karate, skateboard, rummy,
];

const BY_ID = Object.fromEntries(SPORTS.map((s) => [s.id, s]));

/** Full SportDefinition for an id, or null if unknown. */
export const getSport = (id) => BY_ID[id] || null;

/** All sports in canonical picker order. */
export const listSports = () => SPORTS;

/** Lightweight meta lookup with a safe fallback (never throws). */
export const sportMeta = (id) => {
  const s = BY_ID[id];
  return s
    ? { id: s.id, name: s.name, icon: s.icon, tag: s.tag, color: s.color, accent: s.accent }
    : { id, name: id, icon: 'trophy-outline', tag: '', color: '#22c55e', accent: '#abd600' };
};

// ── Release gate ─────────────────────────────────────────────────────────────
// Sports that are actually playable today. Everything else is shown in the
// Arena picker but gated behind "Coming Soon", so the cluster still previews
// the full roadmap without letting anyone into a half-built flow.
//
// Shipping a sport = add its id here (and give it the screens/config it needs).
const LIVE_SPORTS = new Set([
  'cricket',   // bespoke feed + full ball-by-ball scoring
  'rummy',     // dedicated Pool Rummy game flow
  'football',  // generic event scoring (SportEvent) + themed feed
  // Wave 1 — goal/point team sports on football's generic SportEvent flow.
  // Full frontend config (scoring.js) + backend parity (setup schema, result +
  // stats in matches.js) already in place; the gate was the only thing missing.
  'hockey',    // goals · Q1–Q4
  'handball',  // field goals + 7m throws · halves
  'basketball',// 2pt/3pt/free throw · Q1–Q4 + OT
  // Wave 2 — rally/net sports on the shared auto game/set engine (RALLY_RULES,
  // mirrored frontend↔backend). Config + backend parity (setup/result/stats)
  // already in place.
  'volleyball',// rally points → sets to 25 (final 15), best of 5
  'badminton', // rally points → games to 21 (cap 30), best of 3
  'tabletennis',// rally points → games to 11, best of 7
  'squash',    // rally points → games to 11, best of 5
  'pickleball',// rally points → games to 11, best of 3
  // Wave 3 — combat 1v1 sports. Signature moves score per real rules; instant
  // finishes (KO/TKO, Pin, Ippon) end the bout. Config + backend parity in place.
  'boxing',    // rounds + KO/TKO; signature punches are stats
  'wrestling', // takedown/suplex/escape/reversal/nearfall/penalty-pt + pin
  'judo',      // ippon / waza-ari / osaekomi + shido
  'karate',    // yuko / waza-ari / ippon / nage-waza + penalty
  // Wave 4 — indigenous team sports. Point-based; config + backend parity in place.
  'kabaddi',   // touch/bonus/tackle points + all-out (·2), 2 halves
  'khokho',    // out/pole-dive (1) + dream-run (2), 4 turns
  // Tennis — its bespoke engine (deriveTennis: 15/30/40, deuce/advantage, games,
  // tiebreak at 6-6, best-of-3 sets) already exists frontend + backend; verified.
  'tennis',
]);

/** Is this sport finished and enterable? */
export const isSportLive = (id) => LIVE_SPORTS.has(id);

export default { getSport, listSports, sportMeta, isSportLive };
