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

/**
 * Wicket types that are NOT the bowler's, lowercase and space-free.
 *
 * A run-out is the fielding side's; a retirement is the batter's own. Every
 * other mode — bowled, caught, lbw, stumped, hit wicket — is credited to the
 * bowler.
 */
const NOT_BOWLERS_WICKET = ['runout', 'retired', 'retiredout', 'retiredhurt'];

/**
 * Is this wicket credited to the bowler?
 *
 * Compared case- and space-insensitively on purpose. The scorer writes
 * `'runout'`; five separate places compared against `'runOut'`, which never
 * matched, so every run-out was silently credited to the bowler — 10 of 36
 * bowlers carried inflated career figures, and "My Stats" disagreed with its
 * own trend chart on the same screen. Same rule in four files, differing in
 * one: the thing this file exists to prevent.
 *
 * A wicket with no type recorded still counts, which is what the old
 * comparisons did — this is a correctness fix, not a change of policy.
 */
export const isBowlerWicket = (b) => {
  if (!b?.isWicket) return false;
  const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
  return !NOT_BOWLERS_WICKET.includes(wt);
};

/**
 * The same rule as a Prisma filter, for counting in the database.
 *
 * Spelled out rather than derived from the list above because Prisma needs the
 * exact stored casing, and `notIn` excludes NULLs in SQL — so a wicket with no
 * type is matched back explicitly, to agree with `isBowlerWicket`.
 */
export const BOWLER_WICKET_WHERE = {
  isWicket: true,
  OR: [
    { wicketType: null },
    { wicketType: { notIn: ['runout', 'runOut', 'retired', 'retiredout', 'retiredhurt'] } },
  ],
};

/**
 * Which phase of the innings an over belongs to: 'powerplay' | 'middle' | 'death'.
 *
 * Proportional to the match length rather than hardcoded, because this app
 * scores T8 through 25-over cricket, not just T20. The proportions are the T20
 * ones — first 30%, last 25% — so a 20-over match splits 1-6 / 7-15 / 16-20,
 * exactly the convention a player already has in their head.
 *
 * `limit` is the match's over allowance; callers that don't know it can pass
 * the innings' highest over number, which is the same thing once it's bowled.
 */
export const inningsPhase = (overNumber, limit) => {
  if (!overNumber || !limit || limit < 3) return null;   // too short to have phases
  if (overNumber <= Math.ceil(limit * 0.30)) return 'powerplay';
  if (overNumber > limit - Math.ceil(limit * 0.25)) return 'death';
  return 'middle';
};

/**
 * Pace or spin, from the free text a player typed into their profile.
 *
 * `bowlingStyle` has never been a controlled vocabulary — it is whatever someone
 * wrote, so this reads "Right-arm offbreak", "SLA", "left arm orthodox" and
 * "medium fast" alike.
 *
 * Returns 'pace' | 'spin' | null, and NULL IS THE IMPORTANT ONE. An unrecognised
 * style is not quietly filed as pace: most players here have no bowling style
 * recorded at all, and a "you struggle against spin" built mostly out of blanks
 * is worse than no answer. Callers exclude nulls and report how many they
 * dropped.
 *
 * Spin is checked first because "slow left-arm" contains "slow" but is spin, and
 * because a wrist spinner who writes "leg break medium" is still a spinner.
 */
const SPIN_WORDS = ['spin', 'orthodox', 'break', 'googly', 'chinaman', 'sla', 'slow left', 'legbreak', 'offbreak', 'tweak'];
const PACE_WORDS = ['fast', 'medium', 'pace', 'seam', 'swing', 'quick'];

export const bowlingKind = (style) => {
  const s = String(style || '').toLowerCase();
  if (!s.trim()) return null;
  if (SPIN_WORDS.some((w) => s.includes(w))) return 'spin';
  if (PACE_WORDS.some((w) => s.includes(w))) return 'pace';
  return null;
};

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
