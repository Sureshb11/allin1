/**
 * RUN OUT — scoring engine.
 *
 * Everything a run out does to the book, in one pure function. No React, no
 * network: the same inputs always produce the same ball, which is what makes it
 * testable (see __tests__/runOutEngine.test.js) and what keeps the four decision
 * sheets in ScoringScreen from each carrying their own half-remembered version
 * of the Laws.
 *
 * Written against the MCC Laws of Cricket, 2017 Code (3rd edition, 2022) —
 * the clauses that actually bite are cited inline:
 *
 *   Law 18.11  runs completed before a dismissal count; the run in progress does not
 *   Law 18.12  the ends the batters occupy after a dismissal
 *   Law 20.1   the ball is dead the instant the wicket is put down → nothing after it scores
 *   Law 21.4   No ball penalty (1 run), charged to the bowler
 *   Law 21.13  runs off a No ball not off the bat are still recorded as No ball extras
 *   Law 21.18  a No ball is not one of the over's six balls
 *   Law 22.4   nothing can be scored off the bat from a Wide
 *   Law 22.5   the Wide penalty plus every run run is recorded as Wide extras
 *   Law 22.7   a Wide is not one of the over's six balls
 *   Law 23     Byes and Leg byes (legal deliveries only)
 *   Law 38.1   a batter is Run out when the wicket is put down while they are out of ground
 *   Law 38.2   a run out is not credited to the bowler
 *   Law 38.3   the non-striker may be run out before the ball is released — no ball is bowled
 *
 * The one input scorers get wrong if you don't ask for it explicitly is
 * `dismissalEnd` — which END the wicket was put down at. It is what decides where
 * the incoming batter walks in, and therefore who is on strike. See resolveEnds().
 */

// A delivery a run out can happen on. 'nodelivery' is Law 38.3 — the bowler
// removes the bails with the non-striker backing up, before releasing: no ball
// has been bowled, so nothing is charged to anyone.
export const DELIVERY = { LEGAL: 'legal', WIDE: 'wide', NOBALL: 'noball', NONE: 'nodelivery' };

// How the completed runs are credited on a legal ball. A Wide forces its own
// type (Law 22.5) and a No ball absorbs byes into the No ball extras (Law 21.13),
// so this only ever discriminates on a legal delivery.
export const RUNS = { BAT: 'bat', BYE: 'bye', LEGBYE: 'legbye' };

// The two ends, named for the batters who start the delivery there.
export const END = { STRIKER: 'striker', NONSTRIKER: 'nonstriker' };

export const OTHER_END = (e) => (e === END.STRIKER ? END.NONSTRIKER : END.STRIKER);

// Nothing that can be run off one delivery exceeds this; anything higher is a
// mis-tap, not a cricket score.
const MAX_RUNS = 6;

/**
 * Where the batters stand once the wicket has fallen.
 *
 * The whole thing reduces to one observation: while a run is being attempted the
 * two batters are travelling in OPPOSITE directions, so at the instant the wicket
 * is put down they are at opposite ends. The dismissed batter is (by definition)
 * at the end where the wicket was put down — short of it — so:
 *
 *   • the incoming batter takes the end the wicket fell at, and
 *   • the not-out batter is at the other end.                        (Law 18.12)
 *
 * This holds for every case, including the ones that trip scorers up:
 *   • no run attempted (keeper whips the bails off) — both are where they started;
 *   • a batter sent back and beaten at the end they came from (they never crossed);
 *   • a batter beaten at the far end after crossing.
 *
 * Which is why the completed-run count does NOT appear here: the runs decide the
 * score, the end of dismissal decides the crease. `overComplete` flips it once
 * more, because the ends change over at the end of an over.
 */
export function resolveEnds({ outSlot, dismissalEnd, overComplete = false }) {
  const survivorSlot = outSlot === END.STRIKER ? END.NONSTRIKER : END.STRIKER;
  // Physically true the moment the bails come off, before the over changes ends.
  const survivorAtStrikerEnd = dismissalEnd === END.NONSTRIKER;
  // The over changing ends swaps who is facing, but not who stands where.
  const survivorOnStrike = overComplete ? !survivorAtStrikerEnd : survivorAtStrikerEnd;
  return {
    survivorSlot,
    survivorAtStrikerEnd,
    newBatterAtStrikerEnd: !survivorAtStrikerEnd,
    nextStrikerIs: survivorOnStrike ? 'survivor' : 'new',
  };
}

/**
 * Over-strip notation for a delivery. Mirrors the server's own notate() in
 * backend/src/routes/matches.js EXACTLY — a resumed match rebuilds the strip from
 * the database, and the "THIS OVER · N runs" tally is parsed back off these
 * strings (see runsInOver in ScoringScreen), so the two must not drift.
 *
 * A wicket on anything other than a plain dot is written the way a scorebook
 * writes it — the delivery, then the wicket: 'W', '1+W', 'B+W', '2b+W', 'WD+W',
 * '3wd+W', 'NB+W', '4nb+W'. Every chip therefore ENDS in 'W' when a wicket fell,
 * which is how the strip counts wickets and colours the dot.
 */
export function ballChip({ extraType, batRuns = 0, extras = 0, isWicket = false }) {
  const w = isWicket ? '+W' : '';
  if (extraType === 'wide') return (extras > 1 ? `${extras}wd` : 'WD') + w;
  if (extraType === 'noBall') { const t = batRuns + extras; return (t > 1 ? `${t}nb` : 'NB') + w; }
  if (extraType === 'bye') return (extras > 1 ? `${extras}b` : 'B') + w;
  if (extraType === 'legBye') return (extras > 1 ? `${extras}lb` : 'LB') + w;
  if (extraType === 'penalty') return 'P5';
  if (extraType === 'deadBall') return 'W';        // no delivery — only ever a wicket
  if (isWicket) return batRuns > 0 ? `${batRuns}+W` : 'W';
  return batRuns === 0 ? '·' : String(batRuns);
}

// A delivery that took a wicket. Every wicket chip ends in 'W' — 'W' on its own,
// or the delivery with '+W' written onto it.
export const isWicketChip = (chip) => String(chip).endsWith('W');

/**
 * Runs on the board from one chip — the inverse of ballChip(). The over strip is
 * the only record of an over that's still in progress (and the one a resumed match
 * rebuilds from the server), so the "THIS OVER · N runs" tally is read back off
 * these strings rather than kept as a second, driftable counter.
 */
export function chipRuns(chip) {
  const c = String(chip);
  const d = c.endsWith('+W') ? c.slice(0, -2) : c;   // drop the wicket marker
  if (d === 'WD' || d === 'NB' || d === 'B' || d === 'LB') return 1;
  if (d === 'P5') return 5;
  if (d === '·' || d === 'W' || d === '') return 0;
  const n = parseInt(d, 10);                          // '2wd', '3nb', '2b', '3lb', or plain runs
  return isNaN(n) ? 0 : n;
}

export const overRuns = (chips) => chips.reduce((acc, c) => acc + chipRuns(c), 0);

/**
 * Resolve a run out into a complete ball.
 *
 * @param delivery          DELIVERY.* — what was bowled
 * @param runsCompleted     runs the batters COMPLETED before the wicket fell. The
 *                          run in progress is never one of them (Law 18.11).
 * @param runsType          RUNS.* — how those runs are credited (legal ball only)
 * @param outSlot           END.* — which batter is out, named by where they STARTED
 *                          the delivery ('striker' = the one facing)
 * @param dismissalEnd      END.* — the end the wicket was put down at
 * @param ballsInOverBefore legal balls already bowled in this over (0–5)
 * @param freeHit           was this delivery a free hit?
 * @param shortRuns         runs disallowed as short (Law 18.5), docked from the total
 */
export function resolveRunOut({
  delivery = DELIVERY.LEGAL,
  runsCompleted = 0,
  runsType = RUNS.BAT,
  outSlot = END.STRIKER,
  dismissalEnd = END.STRIKER,
  ballsInOverBefore = 0,
  freeHit = false,
  shortRuns = 0,
} = {}) {
  const errors = [];   // the scorer must fix these — the ball can't be recorded
  const notes = [];    // silently corrected: the input was a category mistake, not a typo

  // ── Validation ────────────────────────────────────────────────────────────
  if (!Object.values(DELIVERY).includes(delivery)) errors.push(`Unknown delivery type: ${delivery}`);
  if (!Object.values(END).includes(outSlot)) errors.push(`Unknown batter: ${outSlot}`);
  if (!Object.values(END).includes(dismissalEnd)) errors.push(`Unknown end: ${dismissalEnd}`);
  if (!Number.isInteger(runsCompleted) || runsCompleted < 0) errors.push('Completed runs must be 0 or more');
  else if (runsCompleted > MAX_RUNS) errors.push(`No more than ${MAX_RUNS} runs can be run off one delivery`);

  // Law 38.3: the bowler removes the bails before releasing. No delivery has been
  // bowled, so no runs, no ball faced, and it can only ever be the non-striker,
  // at the non-striker's end.
  if (delivery === DELIVERY.NONE) {
    if (runsCompleted > 0) errors.push('No runs can be scored — the ball was never bowled (Law 38.3)');
    if (outSlot !== END.NONSTRIKER) errors.push('Only the non-striker can be run out before delivery (Law 38.3)');
    if (dismissalEnd !== END.NONSTRIKER) errors.push('The wicket is put down at the bowler’s end (Law 38.3)');
  }
  // Law 22.4: a Wide cannot be hit, so runs run off it are never the batter's.
  // Nothing for the scorer to fix — the runs are simply booked as Wide extras.
  if (delivery === DELIVERY.WIDE && runsType !== RUNS.BAT && runsCompleted > 0) {
    notes.push('Runs run off a Wide are Wide extras, never byes or leg byes (Law 22.5)');
  }
  if (shortRuns < 0 || shortRuns > runsCompleted) errors.push('Short runs cannot exceed the runs completed');

  // ── Runs ──────────────────────────────────────────────────────────────────
  // Everything after the wicket falls is dead (Law 20.1), so `runsCompleted` is
  // the whole story — an overthrow that reaches the boundary AFTER the dismissal
  // scores nothing, and the run in progress is not scored (Law 18.11).
  const scored = Math.max(0, runsCompleted - Math.max(0, shortRuns));

  let batRuns = 0;
  let extras = 0;
  let extraType = null;
  let ballFaced = 0;
  let legal = false;
  let creditedAs;

  if (delivery === DELIVERY.NONE) {
    extraType = 'deadBall';                 // stored, but not one of the over's balls
    creditedAs = 'none';
  } else if (delivery === DELIVERY.WIDE) {
    extras = 1 + scored;                    // Law 22.5 — penalty + every run run
    extraType = 'wide';
    creditedAs = 'wide';                    // Law 22.7 — not one of the six
  } else if (delivery === DELIVERY.NOBALL) {
    extraType = 'noBall';
    ballFaced = 1;                          // a No ball is a ball faced by the striker
    if (runsType === RUNS.BAT) {
      batRuns = scored;                     // off the bat → the striker's runs
      extras = 1;                           // Law 21.4 — the No ball penalty
      creditedAs = 'bat';
    } else {
      extras = 1 + scored;                  // Law 21.13 — byes off a No ball are No ball extras
      creditedAs = 'noball';
    }
  } else {
    legal = true;
    ballFaced = 1;
    if (runsType === RUNS.BYE) { extras = scored; extraType = scored ? 'bye' : null; creditedAs = 'bye'; }
    else if (runsType === RUNS.LEGBYE) { extras = scored; extraType = scored ? 'legBye' : null; creditedAs = 'legbye'; }
    else { batRuns = scored; creditedAs = 'bat'; }
  }

  const teamRuns = batRuns + extras;
  // What the bowler is charged with: runs off the bat, the Wide penalty and every
  // run run off a Wide, and the No ball penalty (Law 21.4 / 22.5). Byes and leg
  // byes off a legal ball are not the bowler's fault and are not charged.
  const chargedToBowler =
    delivery === DELIVERY.WIDE ? 1 + scored
    : delivery === DELIVERY.NOBALL ? 1 + scored
    : delivery === DELIVERY.NONE ? 0
    : (runsType === RUNS.BAT ? scored : 0);

  // ── The over ──────────────────────────────────────────────────────────────
  const countsAsBall = legal;                                     // Laws 21.18 / 22.7
  const ballsInOverAfter = ballsInOverBefore + (countsAsBall ? 1 : 0);
  const overComplete = ballsInOverAfter >= 6;

  // ── Free hit ──────────────────────────────────────────────────────────────
  // A No ball sets one for the following delivery; a Wide (or a no-delivery run
  // out) leaves an existing one standing because neither is the free-hit ball;
  // a legal delivery consumes it.
  const freeHitNext =
    delivery === DELIVERY.NOBALL ? true
    : delivery === DELIVERY.LEGAL ? false
    : freeHit;

  // ── The crease ────────────────────────────────────────────────────────────
  const ends = resolveEnds({ outSlot, dismissalEnd, overComplete });

  const chip = ballChip({ extraType, batRuns, extras, isWicket: true });

  return {
    valid: errors.length === 0,
    errors, notes,

    // Scoring
    batRuns, extras, extraType, teamRuns, chargedToBowler, creditedAs,
    runsCompleted: scored,
    runInProgressScored: false,             // Law 18.11 — always, by definition

    // Book-keeping
    countsAsBall, ballFaced, ballsInOverAfter, overComplete,
    wicketToBowler: false,                  // Law 38.2 — never the bowler's wicket
    wicketType: 'runout',
    freeHitNext,

    // Crease
    ...ends,
    outSlot, dismissalEnd,
    newBatterEnd: dismissalEnd,             // the incoming batter fills the end that fell

    // Presentation
    chip,
  };
}

