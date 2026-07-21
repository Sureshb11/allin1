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
]);

/** Is this sport finished and enterable? */
export const isSportLive = (id) => LIVE_SPORTS.has(id);

export default { getSport, listSports, sportMeta, isSportLive };
