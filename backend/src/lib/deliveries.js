// What counts as a ball, in one place.
//
// This list existed three times over — teamStats.js, mvp.js and routes/matches.js
// each declared its own identical copy — and a fourth was about to be written for
// deriveResultFromMatch. A rule about the laws of cricket that lives in four
// files is a rule that will eventually differ in one of them, which is how the
// overs in a tournament result came to be zero in the first place.
//
// A wide and a no ball are not deliveries the batter is judged on and do not
// advance the over. Penalty runs, a retirement and a dead ball are not
// deliveries at all.
export const NON_BALL_EXTRAS = ['wide', 'noBall', 'penalty', 'retired', 'deadBall'];

/** Does this ball advance the over? */
export const isLegalDelivery = (b) => !NON_BALL_EXTRAS.includes(b?.extraType);

/** Legal deliveries → cricket's own notation, 51 → "8.3". For display. */
export const oversNotation = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

/**
 * Legal deliveries → a true decimal, 51 → 8.5. For ARITHMETIC.
 *
 * Net run rate divides runs by overs, and 51 balls is eight and a half overs,
 * not 8.3 — feeding the notation into a division is a classic way to get a run
 * rate that is quietly wrong all season.
 */
export const oversDecimal = (balls) => Math.round((balls / 6) * 1000) / 1000;
