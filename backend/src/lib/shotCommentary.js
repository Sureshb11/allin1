// One line of commentary from one delivery.
//
// Templates, not a model. A model call per ball would cost money on every dot in
// every match, add latency to the thing that must stay fastest, and produce a
// worse sentence than a template for "no run, defended" — which is most balls.
// The interesting deliveries (wickets, milestones, turning points) are where a
// model earns its keep, and this file deliberately does NOT handle those: it
// returns the plain line, and anything richer is layered on top later for the
// handful of moments that deserve it.
//
// Nothing here throws. A commentary line is decoration on a delivery that is
// already saved and already counted; if this file cannot produce a sentence it
// returns null and the ball is exactly as correct as it was before.

import { shotVerb, shotLabel, zoneLabel, shotCategory } from './ballIntelligence.js';

/** "Virat Kohli" → "Kohli". Commentary uses surnames; scorecards use full names. */
const surname = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || 'The batter');
};

// How the ball left the bat, when the scorer said. Reads as commentary, not as
// a data field: "edges" and "mistimes" are verbs a listener expects.
const CONNECTION_PHRASE = {
  edge:     'edges',
  mistimed: 'mistimes',
  missed:   'misses',
};

/**
 * Pick one of several phrasings, STABLY, from the delivery's own id.
 *
 * Variety is what stops six sixes in an over reading like six copies of the same
 * sentence. But it has to be the same variety every time: a spectator's screen
 * refetches every few seconds, and a line that reshuffled on each poll would
 * make the commentary feel broken rather than alive. Hashing the ball id gives a
 * choice that is arbitrary across balls and fixed forever for any one of them —
 * no random, no stored column, no model.
 */
const pick = (variants, seed) => {
  if (!variants.length) return null;
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return variants[Math.abs(h) % variants.length];
};

/**
 * The line for one delivery.
 *
 * `ball`   — the stored delivery (runs, extras, isWicket, wicketType…)
 * `shot`   — the BallIntelligence row, or null when nothing was captured
 * `names`  — { batter, bowler, fielder }
 *
 * Returns a string, or null when there is nothing worth saying.
 */
export const commentaryFor = (ball, shot, names = {}) => {
  try {
    if (!ball) return null;
    const bat = surname(names.batter);
    const bowl = surname(names.bowler);
    const runs = Number(ball.runs) || 0;
    const extras = Number(ball.extras) || 0;
    const zone = shot?.shotZone ? zoneLabel(shot.shotZone) : null;
    const verb = shot?.shotType ? shotVerb(shot.shotType) : null;
    const cat = shot?.shotType ? shotCategory(shot.shotType) : null;

    // ── Extras first: the delivery is the story, not the stroke ──────────────
    if (ball.extraType === 'wide')   return `Wide down the side, ${bowl} strays${extras > 1 ? ` — ${extras} to the total` : ''}.`;
    if (ball.extraType === 'noBall') return `No ball, ${bowl} oversteps${runs ? ` and ${bat} takes ${runs}` : ''}.`;
    if (ball.extraType === 'bye')    return `${extras} bye${extras !== 1 ? 's' : ''}, through to the keeper.`;
    if (ball.extraType === 'legBye') return `${extras} leg bye${extras !== 1 ? 's' : ''} off the pad.`;
    if (ball.extraType === 'penalty') return `Five penalty runs awarded.`;

    // ── Wickets ──────────────────────────────────────────────────────────────
    // The big moments get several phrasings each, chosen stably from the ball's
    // own id. This is deliberately where the writing effort went: these are the
    // deliveries anybody rereads, and a template that varies is indistinguishable
    // from a model on a sentence this short — without a key, a bill, or a
    // network call that can fail.
    if (ball.isWicket) {
      const wt = String(ball.wicketType || '').toLowerCase().replace(/\s/g, '');
      const fielder = names.fielder ? surname(names.fielder) : null;
      const seed = ball.id || `${bat}${bowl}${ball.ballNumber}`;
      if (wt === 'bowled') return pick([
        `Bowled him! ${bowl} knocks ${bat} over.`,
        `Through the gate — ${bat} plays around it and the stumps are back.`,
        `Timber! ${bowl} finds a way past ${bat}'s defence.`,
        `${bat} is beaten all ends up, and that is the middle stump.`,
      ], seed);
      if (wt === 'lbw') return pick([
        `Given! ${bat} is trapped in front by ${bowl}.`,
        `Plumb. ${bat} is caught on the crease and the finger goes up.`,
        `${bowl} pins ${bat} on the pad — that looked dead straight.`,
      ], seed);
      if (wt === 'caught' || wt === 'caughtbehind') {
        const where = zone ? ` at ${zone.toLowerCase()}` : '';
        return pick([
          `Caught${fielder ? ` by ${fielder}` : ''}${where} — ${bat} goes, ${bowl} gets the wicket.`,
          `Up goes the ball, and down it comes safely${fielder ? ` into ${fielder}'s hands` : ''}. ${bat} has to walk.`,
          `${bat} picks out the fielder${where} and ${bowl} has his man.`,
        ], seed);
      }
      if (wt === 'stumped') return pick([
        `Stumped! ${bat} is out of the crease and ${fielder || 'the keeper'} does the rest.`,
        `Quick hands from ${fielder || 'the keeper'} — ${bat} never made it back.`,
      ], seed);
      if (wt === 'runout') return pick([
        `Run out! ${bat} is short of the crease${fielder ? `, ${fielder} with the throw` : ''}.`,
        `Terrible mix-up, and ${bat} pays for it${fielder ? ` — ${fielder} was on it in a flash` : ''}.`,
        `Direct hit! ${bat} is well short.`,
      ], seed);
      if (wt === 'hitwicket') return `Hit wicket! ${bat} treads on the stumps.`;
      return `Out! ${bat} departs.`;
    }

    // ── Shots ────────────────────────────────────────────────────────────────
    // A dropped catch outranks the runs: it is the thing that just happened.
    const dropped = ball.droppedBy
      ? ` Put down by ${surname(ball.droppedBy)}${ball.dropDifficulty === 'easy' ? ' — and that was a straightforward one.' : '.'}`
      : '';

    // Nothing captured: fall back to a plain, honest line rather than inventing
    // a stroke the scorer never recorded.
    if (!shot) {
      if (runs === 6) return `Six! ${bat} clears the rope off ${bowl}.${dropped}`;
      if (runs === 4) return `Four! ${bat} finds the boundary.${dropped}`;
      if (runs === 0) return `No run.${dropped}`;
      return `${runs} run${runs !== 1 ? 's' : ''} to ${bat}.${dropped}`;
    }

    const where = zone ? ` through ${zone.toLowerCase()}` : '';
    const overWhere = zone ? ` over ${zone.toLowerCase()}` : '';

    // The scorer said the bat did not middle it — say so, whatever the runs.
    if (shot.connectionType && CONNECTION_PHRASE[shot.connectionType] && runs < 4) {
      const cp = CONNECTION_PHRASE[shot.connectionType];
      if (shot.connectionType === 'missed') return `${bat} ${cp} it, no run.${dropped}`;
      return `${bat} ${cp} it${where}${runs ? ` for ${runs}` : ', no run'}.${dropped}`;
    }

    const seed = ball.id || `${bat}${ball.ballNumber}${runs}`;
    if (runs === 6) {
      return pick([
        verb ? `${bat} ${verb} it${overWhere} for SIX!` : `Six! ${bat} goes long${overWhere}.`,
        `That is enormous — ${bat} clears${overWhere ? overWhere.replace(' over', '') : ' the rope'} with room to spare.`,
        `Into the crowd! ${bat} gets hold of that one${overWhere}.`,
        `${bowl} drops it short and ${bat} deposits it${overWhere} for six.`,
      ], seed) + dropped;
    }
    if (runs === 4) {
      return pick([
        verb ? `${bat} ${verb}${where} for FOUR!` : `Four! Beautifully placed${where}.`,
        `Timed, not forced — that races away${where} for four.`,
        `Four more. ${bat} finds the gap${where} and the fielders can only watch.`,
      ], seed) + dropped;
    }
    if (runs === 0) {
      if (cat === 'defence') return shot.shotType === 'leave' ? `Left alone by ${bat}.` : `Solid defence from ${bat}.${dropped}`;
      if (cat === 'nothing') return `Beaten! ${bowl} finds the edge of nothing.${dropped}`;
      return verb ? `${bat} ${verb} it${where}, but straight to the fielder.${dropped}`
                  : `No run.${dropped}`;
    }
    return verb ? `${bat} ${verb}${where} for ${runs}.${dropped}`
                : `${runs} run${runs !== 1 ? 's' : ''} to ${bat}${where}.${dropped}`;
  } catch {
    // Commentary is decoration. It never gets to break a delivery.
    return null;
  }
};

/**
 * A one-line summary of a completed over, for the between-overs card.
 * `balls` is the over's deliveries in order; `shots` maps ballId → shot row.
 */
export const overSummary = (balls = [], shots = {}, bowlerName = '') => {
  try {
    if (!balls.length) return null;
    const runs = balls.reduce((n, b) => n + (b.runs || 0) + (b.extras || 0), 0);
    const wkts = balls.filter((b) => b.isWicket).length;
    const boundaries = balls.filter((b) => b.runs === 4 || b.runs === 6).length;
    const bits = [`${runs} run${runs !== 1 ? 's' : ''} from the over`];
    if (wkts) bits.push(`${wkts} wicket${wkts !== 1 ? 's' : ''}`);
    if (boundaries) bits.push(`${boundaries} boundar${boundaries !== 1 ? 'ies' : 'y'}`);
    // Name the area only when the over actually had a pattern to it — three of
    // six balls to the same region is a plan; two is a coincidence.
    const zones = balls.map((b) => shots[b.id]?.shotZone).filter(Boolean);
    const tally = {};
    zones.forEach((z) => { tally[z] = (tally[z] || 0) + 1; });
    const [topZone, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [];
    const pattern = n >= 3 ? ` Most of it went through ${zoneLabel(topZone)?.toLowerCase()}.` : '';
    return `${surname(bowlerName) || 'The bowler'}: ${bits.join(', ')}.${pattern}`;
  } catch {
    return null;
  }
};

export default { commentaryFor, overSummary };
