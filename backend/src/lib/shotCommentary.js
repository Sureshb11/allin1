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

import { shotVerb, shotLabel, zoneLabel, shotCategory, sideOfZone } from './ballIntelligence.js';

/**
 * Template groups: `<shotType|category|generic>.<six|four|runs|dot>`.
 *
 * Reusable groups rather than one growing conditional, so adding a stroke means
 * adding a key here and nothing else. Lookup falls back shot -> category ->
 * generic, which is why a brand-new shot type still reads well on the day it is
 * added, before anybody has written it a voice of its own.
 *
 * Every template takes the location from ctx (`where` / `overWhere` / `at`) and
 * never names a region itself. That is what makes it structurally impossible to
 * say "pull through the covers".
 */
const TEMPLATES = {
  // ── Drives ──
  'coverDrive.four': [
    (x) => `Beautiful cover drive, finding the gap${x.where} for four.`,
    (x) => `Excellent timing from ${x.bat}, and that races away${x.where} for four.`,
    (x) => `Lovely cover drive${x.where}, all the way to the boundary.`,
    (x) => `${x.bat} finds the gap${x.where} and picks up four.`,
    (x) => `Classy stroke${x.where}, four runs.`,
  ],
  'straightDrive.four': [
    (x) => `Classic straight drive, racing back past ${x.bowl} for four.`,
    (x) => `Right out of the middle — straight down the ground for four.`,
    (x) => `${x.bat} drives straight and it beats everyone${x.where} for four.`,
  ],
  'insideOut.four': [
    (x) => `${x.bat} opens the face and goes inside-out${x.where} for four.`,
    (x) => `Beautiful inside-out shot${x.where}, and that is four.`,
  ],
  'insideOut.six': [
    (x) => `He has gone inside-out and cleared${x.overWhere.replace(' over', '')} for six!`,
    (x) => `Inside-out and enormous — that is six${x.overWhere}.`,
  ],
  // ── Pulls ──
  'pull.four': [
    (x) => `Powerful pull${x.where} for four.`,
    (x) => `Cracked away${x.where}, and that is four.`,
    (x) => `Excellent pull shot, finding the gap${x.where}.`,
    (x) => `Pulled away beautifully for four.`,
  ],
  'pull.six': [
    (x) => `What a pull! ${x.bat} has launched that${x.overWhere} for six.`,
    (x) => `Picked up early and pulled${x.overWhere} — six more.`,
    (x) => `That is huge. Pulled with real power${x.overWhere}.`,
  ],
  'hook.four': [(x) => `Hooked away${x.where} for four.`,
                (x) => `${x.bat} takes it on and hooks it${x.where} to the fence.`],
  // ── Wrists ──
  'flick.four': [
    (x) => `Lovely flick off the pads, racing away${x.where} for four.`,
    (x) => `Clipped beautifully${x.where} for four.`,
    (x) => `A well-timed flick beats the field${x.where} for four.`,
  ],
  'legGlance.four': [
    (x) => `Glanced fine${x.where} and away for four.`,
    (x) => `Delicate work off the hip, four runs${x.where}.`,
  ],
  // ── Cuts ──
  'lateCut.four': [
    (x) => `Delicate late cut, beating the field${x.where} for four.`,
    (x) => `Guided beautifully behind square, and it runs away for four.`,
    (x) => `Excellent late cut, finding the boundary${x.where}.`,
  ],
  'cut.four': [
    (x) => `Cracked away square${x.where}, and that is four.`,
    (x) => `Cut hard${x.where}, four runs.`,
    (x) => `Short and wide, and ${x.bat} puts it away${x.where}.`,
  ],
  'upperCut.four': [(x) => `Upper cut, over the slips and away${x.where} for four.`],
  'upperCut.six': [(x) => `Upper cut for six! Over the cordon and out${x.overWhere}.`],
  // ── Sweeps ──
  'sweep.four': [
    (x) => `Swept firmly${x.where} for four.`,
    (x) => `Down on one knee and swept away${x.where}, four runs.`,
  ],
  'slogSweep.six': [
    (x) => `Slog-swept into the crowd${x.overWhere}! Six.`,
    (x) => `${x.bat} gets underneath it and clears${x.overWhere} with ease.`,
  ],
  'reverseSweep.four': [(x) => `Reverse swept, and beautifully placed${x.where} for four.`],
  // ── Big hitting ──
  'slog.six': [
    (x) => `Huge slog${x.overWhere}! That has gone all the way for six.`,
    (x) => `No elegance and no need for any — six${x.overWhere}.`,
  ],
  'scoop.four': [(x) => `Scooped fine${x.where}, and the fielders had no chance. Four.`],
  'ramp.four': [
    (x) => `Brilliant ramp shot, guiding it fine${x.where} for four.`,
    (x) => `Ramped over the keeper${x.where} — four.`,
  ],
  // ── Category fallbacks ──
  'drive.four': [
    (x) => `Driven handsomely${x.where} for four.`,
    (x) => `${x.bat} drives, and that is four${x.where}.`,
  ],
  'drive.six': [
    (x) => `Magnificent lofted drive${x.overWhere} for six.`,
    (x) => `Beautifully struck${x.overWhere}, and that has cleared the rope.`,
    // No direction words of its own: this group serves every drive, and saying
    // "straight" here put the word in front of a long-off zone.
    (x) => `Lofted with the full face${x.overWhere} — six.`,
  ],
  'loft.six': [
    (x) => `Clean strike${x.overWhere}, and it sails over the boundary for six.`,
    (x) => `Middled, and that is long gone${x.overWhere}.`,
  ],
  'defence.dot': [
    (x) => (x.at ? `Solidly defended${x.where}.` : `Solidly defended back to ${x.bowl}.`),
    (x) => `Firmly defended${x.where}.`,
    (x) => `${x.bat} plays it back to ${x.bowl}. No run.`,
  ],
  'leave.dot': [
    (x) => (x.sideWord === 'the off side' ? `Good leave outside off.` : `Left alone by ${x.bat}.`),
    (x) => `${x.bat} shoulders arms. No run.`,
  ],
  'nothing.dot': [
    (x) => `Beaten${x.sideWord === 'the off side' ? ' outside off' : ''} — excellent delivery from ${x.bowl}.`,
    (x) => `${x.bowl} beats the bat. Nothing on it.`,
  ],
  // ── Generic ──
  'generic.six': [
    (x) => `Six! ${x.bat} clears the rope${x.overWhere}.`,
    (x) => `Into the crowd${x.overWhere} — six more.`,
  ],
  'generic.four': [
    (x) => `Four! Beautifully placed${x.where}.`,
    (x) => `That races away${x.where} for four.`,
  ],
  'generic.runs': [
    (x) => `Worked away${x.where} for ${x.n}.`,
    (x) => `${x.bat} picks up ${x.n}${x.where}.`,
    (x) => (x.runs === 3 ? `Driven${x.where}, and they race back for three.` : `Pushed${x.where} for ${x.n}.`),
  ],
  'generic.dot': [
    (x) => (x.verb ? `${x.bat} ${x.verb} it${x.where}, but straight to the fielder.` : `No run.`),
    (x) => `No run.`,
  ],
};

/** "Virat Kohli" → "Kohli". Commentary uses surnames; scorecards use full names. */
const surname = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  // Take the last part that is an actual NAME, not an initial. Plenty of players
  // are entered as "Kannan K", and blindly taking the last token turned every
  // line of their commentary into "K picks up a single".
  const named = parts.filter((w) => w.replace(/\./g, '').length > 1);
  const use = named.length ? named : parts;
  return use.length > 1 ? use[use.length - 1] : (use[0] || 'The batter');
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
      // None of these three are the bowler's, so none of these lines name him.
      if (wt === 'obstructing' || wt === 'obstructingthefield') {
        return `Given out — ${bat} obstructed the field.`;
      }
      if (wt === 'timedout') return `Timed out. ${bat} did not make it to the crease in time.`;
      if (wt === 'hitballtwice' || wt === 'hittheballtwice') {
        return `Out — ${bat} struck the ball a second time.`;
      }
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

    // ── Structured shot commentary ───────────────────────────────────────
    // The one rule that shapes this whole section: a template supplies the
    // STROKE language and never the location. Where the ball went always comes
    // from the delivery's own zone, so "cover drive" plus a long-off zone reads
    // "driven... down to long off" and can never produce "through the covers".
    // Rule enforced by construction rather than by remembering.
    const side = shot.shotZone ? sideOfZone(shot.shotZone) : null;
    const sideWord = side === 'off' ? 'the off side'
      : side === 'leg' ? 'the leg side'
      : side === 'straight' ? 'down the ground' : null;
    const at = zone ? zone.toLowerCase() : null;
    const where = at ? ` through ${at}` : (sideWord ? ` through ${sideWord}` : '');
    const overWhere = at ? ` over ${at}` : (sideWord ? ` over ${sideWord}` : '');
    const lofted = shot.lofted === true;

    // The scorer said the bat did not middle it — say so, whatever the runs.
    if (shot.connectionType && CONNECTION_PHRASE[shot.connectionType] && runs < 4) {
      const cp = CONNECTION_PHRASE[shot.connectionType];
      if (shot.connectionType === 'missed') return `${bat} ${cp} it, no run.${dropped}`;
      return `${bat} ${cp} it${where}${runs ? ` for ${runs}` : ', no run'}.${dropped}`;
    }

    const seed = ball.id || `${bat}${ball.ballNumber}${runs}`;
    const band = runs === 6 ? 'six' : runs === 4 ? 'four' : runs === 0 ? 'dot' : 'runs';
    const name = (shot.shotType ? shotLabel(shot.shotType) : '') || '';
    const stroke = lofted && !/loft|slog|scoop|ramp|helicopter|upper|pick/i.test(name)
      ? `lofted ${name.toLowerCase()}` : name.toLowerCase();
    const n = runs === 1 ? 'a single' : runs === 2 ? 'two' : runs === 3 ? 'three' : `${runs}`;
    const ctx = { bat, bowl, at, where, overWhere, sideWord, stroke, n, runs, verb };

    const group = TEMPLATES[`${shot.shotType}.${band}`]
      || TEMPLATES[`${cat}.${band}`]
      || TEMPLATES[`generic.${band}`];
    const line = group ? pick(group, seed) : null;
    if (line) return line(ctx) + dropped;

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
