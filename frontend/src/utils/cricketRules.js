// The laws the app counts by, on the phone's side.
//
// ⚠ THIS IS A COPY. The authority is backend/src/lib/deliveries.js. Same reason
// as src/sports/cricket/wagonWheel.js carries a copy of the zone table: the
// scoring screen has to work out a strike rate on a ground with no signal, and
// a rule you have to fetch is a rule you don't have when it rains.
//
// Keep the two in step. Every one of these three was got wrong by hand at least
// once in the backend before it was moved into one file, and the frontend then
// repeated the same mistakes independently:
//
//   · balls faced omitted 'deadBall', so a non-striker run out before release
//     counted as a ball the striker had faced.
//   · boundaries were counted as `!extraType && runs === 4`, which drops a four
//     struck off a no ball — while the batting table three hundred lines away
//     in the same file counted it correctly. One scorecard, two answers.
//
// Three distinct questions that look like one, which is exactly why they drift:
//
//   isLegalDelivery  does this advance the over?      no ball: NO
//   isBallFaced      did the batter face it?          no ball: YES
//   offTheBat        are the runs the batter's?       no ball: YES

/** Not deliveries at all, or re-bowled: none of these advance the over. */
export const NON_BALL_EXTRAS = ['wide', 'noBall', 'penalty', 'retired', 'deadBall'];

/** Does this ball advance the over? */
export const isLegalDelivery = (b) => !NON_BALL_EXTRAS.includes(b?.extraType);

/**
 * Is this a ball the batter is judged on?
 *
 * A no ball is faced though it does not advance the over. A wide is not — the
 * batter could not reach it. Penalties, retirements and dead balls are not
 * deliveries, but they ARE stored with the striker's id on them, which is how
 * they end up wrongly inflating a strike rate's denominator.
 */
const NOT_FACED = ['wide', 'penalty', 'retired', 'deadBall'];
export const isBallFaced = (b) => !NOT_FACED.includes(b?.extraType);

/** Are these runs the batter's? Boundaries follow this rule, not `!extraType`. */
export const offTheBat = (b) => !b?.extraType || b.extraType === 'noBall';
export const batRuns = (b) => (offTheBat(b) ? (b?.runs || 0) : 0);

/** A four or a six credited to the batter — including one struck off a no ball. */
export const isBoundary = (b) => offTheBat(b) && (b?.runs === 4 || b?.runs === 6);
export const isSix = (b) => offTheBat(b) && b?.runs === 6;

export default { NON_BALL_EXTRAS, isLegalDelivery, isBallFaced, offTheBat, batRuns, isBoundary, isSix };
