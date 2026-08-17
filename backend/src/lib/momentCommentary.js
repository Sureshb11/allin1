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

const client = () => (process.env.GEMINI_API_KEY
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
    if (!process.env.GEMINI_API_KEY) return null;
    const reason = bigMoment(ball, facts);
    if (!reason) return null;

    // Already answered — a corrected shot must not buy a second call for the
    // same delivery.
    if (shot?.aiCommentary) return null;

    const used = await prisma.ballIntelligence.count({
      where: { aiCommentary: { not: null }, ball: { over: { inning: { matchId } } } },
    });
    if (used >= MAX_AI_LINES_PER_MATCH) return null;

    const line = await aiMomentLine(reason, facts, fallback);
    if (!line) return null;

    await prisma.ballIntelligence.update({ where: { ballId: ball.id }, data: { aiCommentary: line } });
    return line;
  } catch {
    // Commentary is decoration on a delivery that is already saved and counted.
    return null;
  }
};

export default { bigMoment, aiMomentLine, maybeStoreAiLine, MAX_AI_LINES_PER_MATCH };
