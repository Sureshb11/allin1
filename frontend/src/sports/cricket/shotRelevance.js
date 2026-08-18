// Which shot was that, probably?
//
// The scorer has just tapped where the ball went. Every stroke in the book is
// still available to them — this only decides what order they are offered in,
// so the right answer is usually the first thing under their thumb.
//
// ── Recommend, never restrict ───────────────────────────────────────────────
// rankShots() returns EVERY key it was given, always. A pull to long-off is
// close to impossible and still comes back — last, but present. Unusual and
// improvised strokes go to unexpected places, and a scorer who cannot record
// what actually happened will record something else, which is worse than a
// list that needed scrolling.
//
// ── Why this runs on the device ─────────────────────────────────────────────
// Scoring works with no signal at all, behind a durable queue. A ranking that
// needed a request per delivery would be a ranking that stopped working in
// exactly the tournament conditions this app is for. So the rules are a local
// table, and a future server-supplied table can be synced down and swapped in
// without touching the scoring UI — that is what RULES/ENGINE_VERSION are for.
//
// ── Deterministic, not learned ──────────────────────────────────────────────
// No model here on purpose. What makes this improvable later is not cleverness
// now, it is the feedback: every delivery stores which rank the scorer actually
// picked, so the day there is enough data to fit weights, there is also a
// record of every time these ones were wrong.

import { angleFromZone, wrapAngle } from './wagonWheel';

/** Bump when any weight or profile below changes, so old feedback stays readable. */
export const ENGINE_VERSION = 1;

/**
 * The weights, in one place.
 *
 * Centralised rather than sprinkled through the picker because the whole point
 * of the exercise is that these are meant to be tuned. A weight buried in a
 * component is a weight nobody will ever dare change.
 */
export const WEIGHTS = {
  zone: 40,       // the tapped wedge is one this stroke naturally reaches
  angle: 25,      // and how near the exact angle is to its natural line
  side: 20,       // off / leg / straight agreement
  hand: 15,       // strokes that need the batter to turn around
  runs: 10,       // a leave does not run three
  boundary: 10,   // a defensive push does not clear the rope
};

/**
 * Where each stroke naturally goes, and how it is played.
 *
 *   angle   its natural line, batter-relative: 0° is straight past the bowler,
 *           clockwise, so the off side is 0–180 and the leg side 180–360. The
 *           SAME frame the zones use, which is why one table serves both hands.
 *   spread  how far off that line the stroke still reads as itself. A generic
 *           drive is wide because it means several things; a square cut is
 *           narrow because it means one.
 *   aerial  'always' | 'often' | 'rarely' | 'never' — its relationship with loft.
 *   power   the runs it is played for: 'boundary', 'placed', 'none'.
 *   turn    true if the batter has to reverse their stance or hands to play it.
 *
 * `spread` does double duty: it decides the angle term AND which zones count as
 * a zone match, so a stroke's direction is stated once rather than as a number
 * here and a hand-written zone list somewhere else that can drift out of step.
 */
export const PROFILES = {
  // ── Drives ──
  straightDrive: { angle: 5,   spread: 38, aerial: 'rarely', power: 'placed' },
  offDrive:      { angle: 35,  spread: 28, aerial: 'rarely', power: 'placed' },
  coverDrive:    { angle: 62,  spread: 30, aerial: 'rarely', power: 'placed' },
  squareDrive:   { angle: 88,  spread: 26, aerial: 'never',  power: 'placed' },
  onDrive:       { angle: 340, spread: 30, aerial: 'rarely', power: 'placed' },
  drive:         { angle: 30,  spread: 72, aerial: 'rarely', power: 'placed' },
  insideOut:     { angle: 45,  spread: 34, aerial: 'often',  power: 'boundary' },
  backFootPunch: { angle: 40,  spread: 30, aerial: 'never',  power: 'placed' },

  // ── Cuts ──
  cut:           { angle: 95,  spread: 28, aerial: 'rarely', power: 'placed' },
  squareCut:     { angle: 92,  spread: 24, aerial: 'rarely', power: 'boundary' },
  lateCut:       { angle: 125, spread: 30, aerial: 'never',  power: 'placed' },
  upperCut:      { angle: 140, spread: 34, aerial: 'always', power: 'boundary' },
  dab:           { angle: 135, spread: 34, aerial: 'never',  power: 'none' },

  // ── Pulls ──
  pull:          { angle: 290, spread: 34, aerial: 'often',  power: 'boundary' },
  hook:          { angle: 250, spread: 34, aerial: 'often',  power: 'boundary' },
  pickUp:        { angle: 275, spread: 34, aerial: 'always', power: 'boundary' },

  // ── Wrists ──
  flick:         { angle: 320, spread: 34, aerial: 'rarely', power: 'placed' },
  legGlance:     { angle: 195, spread: 34, aerial: 'never',  power: 'none' },

  // ── Sweeps ──
  sweep:         { angle: 265, spread: 40, aerial: 'rarely', power: 'placed' },
  fineSweep:     { angle: 205, spread: 32, aerial: 'never',  power: 'placed' },
  slogSweep:     { angle: 300, spread: 34, aerial: 'always', power: 'boundary' },
  paddle:        { angle: 200, spread: 30, aerial: 'never',  power: 'none' },
  reverseSweep:  { angle: 95,  spread: 44, aerial: 'rarely', power: 'placed', turn: true },

  // ── In the air ──
  slog:          { angle: 310, spread: 54, aerial: 'always', power: 'boundary' },
  helicopter:    { angle: 330, spread: 40, aerial: 'always', power: 'boundary' },
  scoop:         { angle: 185, spread: 34, aerial: 'always', power: 'boundary' },
  ramp:          { angle: 165, spread: 38, aerial: 'always', power: 'boundary' },
  reverseScoop:  { angle: 150, spread: 44, aerial: 'always', power: 'boundary', turn: true },
  switchHit:     { angle: 80,  spread: 38, aerial: 'often',  power: 'boundary', turn: true },

  // ── Not really strokes ──
  // No natural line: they go wherever the ball was going. They score on runs
  // instead, which is what actually separates them — a leave is a dot or it is
  // not a leave.
  defensive:       { spread: 0, aerial: 'never', power: 'none' },
  backFootDefence: { spread: 0, aerial: 'never', power: 'none' },
  leave:           { spread: 0, aerial: 'never', power: 'none' },
  beaten:          { spread: 0, aerial: 'never', power: 'none' },
  other:           { spread: 0, aerial: 'rarely', power: 'placed' },
};

/** Smallest angle between two bearings, 0..180. */
const arc = (a, b) => {
  const d = Math.abs(wrapAngle(a) - wrapAngle(b)) % 360;
  return d > 180 ? 360 - d : d;
};

/** Off / leg / straight for a bearing, matching the zone groups exactly. */
export const sideOfAngle = (angle) => {
  const a = wrapAngle(angle);
  if (a >= 350 || a < 10) return 'straight';
  return a < 180 ? 'off' : 'leg';
};

// The floor is unbounded on purpose. Penalties stack — a leave that went for
// four is contradicted on runs AND on loft — so scores genuinely go negative,
// and a band table that stopped at zero simply had no answer for them.
const BANDS = [
  [78, 'veryHigh'], [58, 'high'], [38, 'medium'], [18, 'low'], [-Infinity, 'veryLow'],
];
const bandOf = (score) => BANDS.find(([min]) => score >= min)[1];

/**
 * Rank every stroke for what just happened.
 *
 * @param keys   every shot key to rank — all of them come back, reordered
 * @param zone   the wedge the scorer tapped
 * @param angle  the exact bearing, which is finer than the wedge and is used
 *               as such: two strokes can share "cover" and still be told apart
 * @param runs / isSix / lofted  what the delivery already knows about itself
 * @param hand   'right' | 'left'
 *
 * @returns [{ key, score, band, rank }] highest first, rank starting at 1
 */
export function rankShots({ keys = [], zone, angle, distance = null, runs = 0, isSix = false, lofted = null, hand = 'right' } = {}) {
  // The bearing is the finer signal, so prefer it and fall back to the middle
  // of the tapped wedge when only a zone is known.
  const bearing = angle != null ? wrapAngle(angle) : (zone ? angleFromZone(zone, hand) : null);
  const side = bearing == null ? null : sideOfAngle(bearing);
  const W = WEIGHTS;

  // How far it actually went. A ball that did not travel has a direction that
  // means almost nothing — everything defended goes "towards mid-off" — so the
  // positional terms are damped for short ones. Without this a defensive push
  // could never out-rank a straight drive on a defended dot, because the strokes
  // with no natural line forfeit all eighty-five positional points by design and
  // there was nothing left for them to win on.
  const dist = distance == null ? null : Math.max(0, Math.min(100, distance));
  const travel = dist == null ? 1 : Math.max(0.2, Math.min(1, dist / 45));
  const positional = W.zone + W.angle + W.side;

  const scored = keys.map((key) => {
    const p = PROFILES[key] || PROFILES.other;
    let score = 0;

    if (bearing != null && p.spread > 0 && p.angle != null) {
      const off = arc(bearing, p.angle);
      // Inside the stroke's own arc is a zone match; the angle term then says
      // how central it was, so a cover drive played squarer than usual still
      // ranks above a square drive played straighter than usual.
      if (off <= p.spread) score += W.zone * travel;
      score += W.angle * Math.max(0, 1 - off / (p.spread * 2.2)) * travel;
      if (side && sideOfAngle(p.angle) === side) score += W.side * travel;
    } else if (p.spread === 0) {
      // Direction-agnostic strokes. They are not scored on where it went, so
      // they are credited as if it went nowhere in particular — and the less
      // the ball travelled, the better that description fits.
      score += positional * 0.55 * (1 - travel * 0.7);
    }

    // Runs. A leave that went for four is a contradiction; a slog that went for
    // nothing is merely a bad slog, so this is asymmetric on purpose.
    if (p.power === 'none' && runs >= 4) score -= W.runs;
    else if (runs === 0 && p.power === 'boundary') score -= W.runs;
    else if (runs === 0 && p.power === 'placed') score -= W.runs * 0.5;
    else if (p.power === 'none' && runs <= 1) score += W.runs;
    else if (p.power === 'boundary' && runs >= 4) score += W.runs;
    // A cover drive for four is the canonical boundary, so 'placed' earns its
    // runs credit on anything from a single upwards. Restricting it to 1-3 left
    // the most-played four-scoring shot in cricket beaten to the top of its own
    // zone by the improvised stroke that happens to share it.
    else if (p.power === 'placed' && runs >= 1) score += W.runs;

    // Loft. A six is airborne whether or not anybody ticked the box, so it is
    // read as evidence in its own right rather than waiting to be told.
    const wasAerial = lofted === true || isSix;
    if (wasAerial) {
      if (p.aerial === 'always') score += W.boundary;
      else if (p.aerial === 'often') score += W.boundary * 0.6;
      else if (p.aerial === 'never') score -= W.boundary;
    } else if (lofted === false) {
      if (p.aerial === 'always') score -= W.boundary;
      else if (p.aerial === 'never') score += W.boundary * 0.5;
    }

    // Batting hand. This term is deliberately small, and it is small because
    // the zones are already batter-relative: a left-hander's cover is their
    // cover, so the whole table serves both hands without a mirrored copy.
    // What genuinely depends on hand is nothing about direction — it is only
    // that strokes needing the batter to reverse their stance are rarer than
    // the ones that do not, for anybody.
    // Full weight, not half. A switch hit is genuinely rare, and at half it was
    // arriving second on an ordinary cover drive.
    if (p.turn) score -= W.hand;

    return { key, score: Math.round(score * 10) / 10 };
  });

  scored.sort((a, b) => b.score - a.score || keys.indexOf(a.key) - keys.indexOf(b.key));
  return scored.map((s, i) => ({ ...s, rank: i + 1, band: bandOf(s.score) }));
}

/**
 * The handful to put under the scorer's thumb.
 *
 * Capped rather than "everything above a threshold" because this row exists to
 * be hit without reading. Six is two rows of three; a dozen suggestions is just
 * the full list again with extra steps.
 */
export function likelyShots(args, limit = 6) {
  return rankShots(args).slice(0, limit);
}

export default { rankShots, likelyShots, PROFILES, WEIGHTS, ENGINE_VERSION, sideOfAngle };
