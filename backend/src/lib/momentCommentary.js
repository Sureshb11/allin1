// The few balls worth a model call.
//
// Most deliveries are a dot defended to mid-on, and a template writes that
// better than a model would — see lib/shotCommentary.js, which handles every
// ball. This file is only about the handful where a written line adds something
// a template cannot: a wicket, a six, a milestone, a chase turning.
//
// Three hard rules, because the failure mode here is money and latency:
//
//   1. It is asked ONCE per delivery, at capture, and the answer is stored. A
//      spectator's screen refetches every six seconds; generating on read would
//      bill a model call per viewer per ball.
//   2. It is capped per match. A model that is down, slow, or looping cannot
//      cost more than a fixed number of calls no matter what the scorer does.
//   3. It cannot fail anything. No await on the scoring path, every call
//      guarded, and the template line is always already there as the answer if
//      this returns nothing.

import { GoogleGenAI } from '@google/genai';

/**
 * Ceiling per match. A high-scoring T20 might have thirty sixes and ten wickets;
 * beyond that the moments have stopped being moments, and the cap is what makes
 * the cost of this feature knowable in advance rather than a function of how
 * well somebody batted.
 */
export const MAX_AI_LINES_PER_MATCH = 60;

/**
 * Is this worth a model call?
 *
 * Returns a short reason string (which becomes part of the prompt) or null.
 * Deliberately narrow: everything not listed here is a template's job, and the
 * bar for adding to this list is "a template genuinely cannot say it".
 */
export const bigMoment = (ball, ctx = {}) => {
  if (!ball) return null;
  if (ball.isWicket) {
    if (ctx.batterRuns >= 50) return 'a wicket that ends a big innings';
    if (ctx.hatTrickBall) return 'a hat-trick ball';
    return 'a wicket';
  }
  if (ball.runs === 6) return 'a six';
  // A milestone reached BY this ball — 50, 100, 150…
  if (ctx.batterRuns != null && ctx.batterRuns >= 50 && (ctx.batterRuns % 50) < (ball.runs || 0)) {
    return `a batting milestone (${Math.floor(ctx.batterRuns / 50) * 50})`;
  }
  // A boundary that materially changes a chase.
  if (ball.runs === 4 && ctx.chaseSwing) return 'a boundary at a turning point in the chase';
  return null;
};

/**
 * The off switch: set AI_COMMENTARY=off to stop every model call here.
 *
 * Separate from GEMINI_API_KEY on purpose. That key is shared with the
 * historical-stats importer, so "turn off AI commentary" must not mean
 * "break stat extraction as well" — turning this feature off should cost
 * nothing else. Default is ON when a key exists, because the whole design is
 * already a few dozen small calls per match, capped.
 */
export const aiCommentaryEnabled = () =>
  !!process.env.GEMINI_API_KEY && String(process.env.AI_COMMENTARY || '').toLowerCase() !== 'off';

const client = () => (aiCommentaryEnabled()
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null);

/**
 * One line of commentary for one big moment.
 *
 * Returns a string, or null — and null is a perfectly good outcome that the
 * caller already has a template answer for. Never throws.
 *
 * The prompt is deliberately tight and fed only facts we hold. The model is
 * asked to WRITE, not to reason about cricket: everything it needs is in the
 * brief, so it cannot invent a partnership or a match situation nobody told it
 * about. `fallback` is passed in so the model has the plain version to improve
 * on rather than a blank page.
 */
export const aiMomentLine = async (reason, facts = {}, fallback = null) => {
  const ai = client();
  if (!ai) return null;
  try {
    const brief = [
      `Moment: ${reason}.`,
      facts.batter && `Batter: ${facts.batter}${facts.batterRuns != null ? ` (${facts.batterRuns})` : ''}.`,
      facts.bowler && `Bowler: ${facts.bowler}.`,
      facts.runs != null && `Runs off the ball: ${facts.runs}.`,
      facts.shot && `Shot: ${facts.shot}.`,
      facts.zone && `Direction: ${facts.zone}.`,
      facts.wicketType && `Dismissal: ${facts.wicketType}.`,
      facts.fielder && `Fielder: ${facts.fielder}.`,
      facts.score && `Score: ${facts.score}.`,
      fallback && `Plain version: ${fallback}`,
    ].filter(Boolean).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{
        role: 'user',
        parts: [{
          text:
`You write live cricket commentary for a local-cricket app.

Write ONE sentence about the moment below. Rules:
- Use ONLY the facts given. Do not invent scores, partnerships, match situations, or crowd reactions.
- Under 20 words. Present tense. No emoji, no markdown, no quotation marks.
- Sound like a broadcast commentator, not a match report.
- If the facts are thin, stay plain rather than embellishing.

${brief}`,
        }],
      }],
    });

    const line = String(response.text || '').trim().replace(/^["']|["']$/g, '');
    // A model that returns a paragraph, or nothing, is not usable here — the
    // caller's template line is better than a bad one.
    if (!line || line.length > 220) return null;
    return line;
  } catch {
    return null;
  }
};

/**
 * The whole decision, for one recorded delivery. Safe to call and forget.
 *
 * Returns the line it stored, or null. Does its own cap check, so callers cannot
 * forget to. Nothing awaits this on a path that matters.
 */
export const maybeStoreAiLine = async (prisma, { ball, shot, matchId, facts, fallback }) => {
  try {
    // Checked before ANY database work, so a switched-off feature costs not one
    // query either.
    if (!aiCommentaryEnabled()) return null;
    const reason = bigMoment(ball, facts);
    if (!reason) return null;

    // Already attempted — note `!= null`, not truthiness. An empty string is the
    // marker for "asked, got nothing usable", and it has to block a retry just
    // as firmly as a successful line does. A scorer correcting the shot on a
    // wicket must not buy a fresh call each time they change their mind.
    if (shot?.aiCommentary != null) return null;

    // Counts ATTEMPTS, not successes, because failures cost too.
    //
    // This originally counted only stored lines, which meant the cap did nothing
    // in the one situation it exists for: if the key is wrong or the quota is
    // gone, every call fails, nothing is stored, the count stays at zero, and
    // every qualifying ball for the rest of the match tries again. The cap was
    // real for the happy path and absent for the failing one — precisely
    // backwards.
    const used = await prisma.ballIntelligence.count({
      where: { aiCommentary: { not: null }, ball: { over: { inning: { matchId } } } },
    });
    if (used >= MAX_AI_LINES_PER_MATCH) return null;

    const line = await aiMomentLine(reason, facts, fallback);

    // Empty string on failure: it marks the delivery as asked-and-answered so it
    // is never retried, and it counts toward the cap. Reads use `||`, so an
    // empty string falls through to the template exactly like a null would —
    // the spectator sees no difference.
    await prisma.ballIntelligence.update({
      where: { ballId: ball.id },
      data: { aiCommentary: line || '' },
    });
    return line || null;
  } catch {
    // Commentary is decoration on a delivery that is already saved and counted.
    return null;
  }
};

export default { bigMoment, aiMomentLine, maybeStoreAiLine, MAX_AI_LINES_PER_MATCH };
