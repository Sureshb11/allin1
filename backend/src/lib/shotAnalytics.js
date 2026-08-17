// What the shot data adds up to.
//
// One aggregator, used by the match summary, the spectator screen and the player
// profile, so the three can never quietly disagree about the same player's cover
// drive. Pure functions over rows — no database, no Prisma — so it can be tested
// on made-up numbers and reused wherever the rows come from.
//
// The honesty rules live here rather than in the UI, because a number is only
// half a fact: 3 balls at a strike rate of 200 is not a strength, and any screen
// that renders it without saying so is lying politely. Callers get the sample
// size and a confidence band attached to every claim, and claims that do not
// clear the bar are not returned at all.

import { shotLabel, zoneLabel, shotCategory } from './ballIntelligence.js';

/**
 * How much to trust a split, by how many balls are behind it.
 *
 * The bands are the ones the brief asked for. The point of naming them is that
 * "Early indication" and "Strong statistical trend" are different claims, and a
 * player reading their own profile deserves to know which one they are looking
 * at before they change how they bat.
 */
export const confidenceFor = (balls) => {
  if (balls < 20)  return { key: 'insufficient', label: 'Insufficient data' };
  if (balls < 50)  return { key: 'early',        label: 'Early indication' };
  if (balls < 100) return { key: 'moderate',     label: 'Moderate confidence' };
  return { key: 'strong', label: 'Strong statistical trend' };
};

/** Below this, nothing is called a strength or a weakness. Not "shown greyed out" — not returned. */
export const MIN_BALLS_FOR_CLAIM = 20;

/**
 * A split has to differ from the player's own baseline by this much to be worth
 * mentioning. Measured against THEIR average, not a league one: the useful fact
 * is "you score faster cutting than you do generally", which is true for a tail
 * ender at 70 and an opener at 140 alike.
 */
const MEANINGFUL_SR_GAP = 15;

const emptyBucket = () => ({ balls: 0, runs: 0, fours: 0, sixes: 0, dots: 0, outs: 0 });

const finalise = (b) => {
  const boundaries = b.fours + b.sixes;
  return {
    balls: b.balls,
    runs: b.runs,
    // Strike rate over the deliveries where a shot was actually captured — NOT
    // over every ball the player faced. A partly-tracked innings would otherwise
    // read as a collapse in scoring rate that never happened.
    strikeRate: b.balls ? Math.round((b.runs / b.balls) * 100) : null,
    fours: b.fours,
    sixes: b.sixes,
    boundaries,
    boundaryPercent: b.balls ? Math.round((boundaries / b.balls) * 100) : null,
    dots: b.dots,
    dotPercent: b.balls ? Math.round((b.dots / b.balls) * 100) : null,
    outs: b.outs,
    confidence: confidenceFor(b.balls),
  };
};

/**
 * Roll shot rows up by shot type, by zone, and by shot category.
 *
 * `shots` are the flattened rows the intelligence endpoint already returns:
 * { shotType, zone, runs, isWicket }.
 */
export const aggregateShots = (shots = []) => {
  const byShot = {};
  const byZone = {};
  const byCategory = {};
  const totals = emptyBucket();

  for (const s of shots) {
    const runs = Number(s.runs) || 0;
    const add = (bucket) => {
      bucket.balls += 1;
      bucket.runs += runs;
      if (runs === 4) bucket.fours += 1;
      if (runs === 6) bucket.sixes += 1;
      if (runs === 0) bucket.dots += 1;
      if (s.isWicket) bucket.outs += 1;
    };
    add(totals);
    if (s.zone) { byZone[s.zone] = byZone[s.zone] || emptyBucket(); add(byZone[s.zone]); }
    if (s.shotType) {
      byShot[s.shotType] = byShot[s.shotType] || emptyBucket();
      add(byShot[s.shotType]);
      const cat = shotCategory(s.shotType);
      if (cat) { byCategory[cat] = byCategory[cat] || emptyBucket(); add(byCategory[cat]); }
    }
  }

  const shape = (map, labeller) => Object.entries(map)
    .map(([key, b]) => ({ key, label: labeller(key) || key, ...finalise(b) }))
    .sort((a, b) => b.balls - a.balls);

  return {
    totals: finalise(totals),
    byShot: shape(byShot, shotLabel),
    byZone: shape(byZone, zoneLabel),
    byCategory: shape(byCategory, (k) => k),
  };
};

/**
 * Where a batter scores and where they don't.
 *
 * Deliberately conservative. A split is only returned if it clears
 * MIN_BALLS_FOR_CLAIM, and only if it differs from the player's OWN strike rate
 * by a margin worth acting on. Everything that fails those tests is counted into
 * `withheld` instead of being shown with a caveat — a weakness printed in grey
 * is still a weakness the reader remembers.
 */
export const strengthsAndWeaknesses = (agg) => {
  const base = agg?.totals?.strikeRate;
  const strengths = [];
  const weaknesses = [];
  let withheld = 0;

  const consider = (row, kind) => {
    if (row.balls < MIN_BALLS_FOR_CLAIM || base == null || row.strikeRate == null) { withheld += 1; return; }
    const gap = row.strikeRate - base;
    if (Math.abs(gap) < MEANINGFUL_SR_GAP) return;          // real sample, unremarkable
    const entry = {
      kind, key: row.key, label: row.label,
      strikeRate: row.strikeRate, balls: row.balls, runs: row.runs,
      versusAverage: gap > 0 ? `+${gap}` : String(gap),
      confidence: row.confidence,
    };
    (gap > 0 ? strengths : weaknesses).push(entry);
  };

  (agg?.byShot || []).forEach((r) => consider(r, 'shot'));
  (agg?.byZone || []).forEach((r) => consider(r, 'zone'));

  /**
   * Drop a zone that is just a shot wearing a different hat.
   *
   * A cover drive goes to cover. When every ball of a shot type went to one
   * zone, the two rows describe the SAME population and reporting both says
   * "you are strong at the cut" and "you are strong at point" as if a player
   * had found two things to work on. Matched on identical balls AND runs, which
   * is what makes them the same set rather than merely similar; the shot type
   * survives because it names something a batter can actually practise.
   */
  const dedupe = (list) => {
    const shotRows = list.filter((e) => e.kind === 'shot');
    return list.filter((e) => e.kind === 'shot'
      || !shotRows.some((s) => s.balls === e.balls && s.runs === e.runs));
  };

  const bySize = (a, b) => Math.abs(Number(b.versusAverage)) - Math.abs(Number(a.versusAverage));
  return {
    baseline: base,
    strengths: dedupe(strengths).sort(bySize),
    weaknesses: dedupe(weaknesses).sort(bySize),
    // Surfaced so the UI can say "12 more need a bigger sample" rather than
    // implying the player simply has no weaknesses.
    withheld,
  };
};

/**
 * The headline numbers for a match's Ball Intelligence summary.
 *
 * No confidence gating here on purpose: this describes ONE match and makes no
 * claim about the player in general. "You hit four boundaries through cover
 * today" is a fact about today, not a trend.
 */
export const matchShotSummary = (shots = []) => {
  const agg = aggregateShots(shots);
  const boundaryZones = [...agg.byZone]
    .filter((z) => z.boundaries > 0)
    .sort((a, b) => b.boundaries - a.boundaries)
    .slice(0, 5);
  return {
    captured: agg.totals.balls,
    runs: agg.totals.runs,
    boundaries: agg.totals.boundaries,
    topZones: agg.byZone.slice(0, 5),
    topShots: agg.byShot.slice(0, 5),
    boundaryZones,
    // Empty when nobody recorded a shot type all match, which is allowed — zones
    // are one tap and shot types are optional, so this can legitimately be bare.
    hasShotTypes: agg.byShot.length > 0,
  };
};

export default { aggregateShots, strengthsAndWeaknesses, matchShotSummary, confidenceFor, MIN_BALLS_FOR_CLAIM };
