// "End of over N" — the between-overs card, computed once for every screen.
//
// This lived inside ScorecardScreen, which was fine while that was the only
// screen showing a ball-by-ball feed. It stopped being fine the moment the Live
// match screen became the app's single match destination: the summaries simply
// vanished from the default view, because the function that built them was
// private to the other file.
//
// Copying it across would have recreated the exact fault this codebase has been
// paying down all week — a rule written down twice, drifting in one copy. And
// this is not a formatting helper: it carries real cricket knowledge that is
// easy to get subtly wrong and hard to notice when it is.
//
//   • what the bowler is charged for   — byes and leg byes are the fielding
//     side's fault, not his, so they never hit his figures; a wide costs him
//     every run of it; a no ball costs him the penalty AND whatever was hit
//   • what counts as a ball he bowled  — a wide or no ball is not one of his six
//   • what counts as a ball faced      — a wide is not faced; a no ball is
//   • maidens                          — six legal balls, nothing charged, and
//     only when ONE bowler sent the whole over down (overs can be shared)
//   • which wickets are his            — a run out is nobody's wicket
//
// The bowler and batter rules come from utils/cricketRules, not from a local
// list, for the same reason this file exists at all.

import { NON_BALL_EXTRAS, isBowlerWicket } from './cricketRules';

/**
 * Summaries for every COMPLETED over in an innings, newest first.
 *
 * Returns `[{ over, total, bat: [{name, runs, balls}], bowler: {name, fig} }]`.
 * An over still in progress is deliberately absent — "End of over 7" under a
 * three-ball over would be a lie, and the current over is already on screen
 * above the feed as the live ball strip.
 *
 * `total` is the running team score AT THE END of that over, taken from the
 * stored per-over aggregates rather than re-added from the balls, so it agrees
 * with the scorecard by construction.
 */
export function computeOverEndSummaries(innings) {
  const overs = [...(innings?.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  const legalIn = (over) => (over.balls || []).filter((b) => !NON_BALL_EXTRAS.includes(b.extraType)).length;
  const batRuns = {}, batBalls = {}, batName = {};
  const bowl = {};   // bowlerId -> cumulative { name, balls, runs, wkts, maidens }
  let runningRuns = 0, runningWkts = 0;
  const out = [];
  for (const over of overs) {
    // Team total from the stored per-over aggregates (authoritative).
    runningRuns += (over.runs || 0) + (over.extras || 0);
    runningWkts += (over.wickets || 0);
    let lastStriker = null, lastNon = null, overCharged = 0, overLegal = 0;
    let lastBowlerId = over.bowlerId;
    const overBowlers = new Set();
    for (const b of (over.balls || [])) {
      const bId = b.bowlerId || over.bowlerId;   // per-delivery bowler (shared overs)
      if (bId) {
        if (!bowl[bId]) bowl[bId] = { name: b.bowler?.name || over.bowler?.name || 'Bowler', balls: 0, runs: 0, wkts: 0, maidens: 0 };
        overBowlers.add(bId); lastBowlerId = bId;
      }
      const et = b.extraType;
      if (b.batterId) {
        batName[b.batterId] = b.batter?.name || 'Batter';
        if (et !== 'wide' && et !== 'penalty' && et !== 'retired') batBalls[b.batterId] = (batBalls[b.batterId] || 0) + 1;
        if (!et || et === 'noBall') batRuns[b.batterId] = (batRuns[b.batterId] || 0) + b.runs;
      }
      if (b.nonStrikerId) batName[b.nonStrikerId] = b.nonStriker?.name || batName[b.nonStrikerId] || 'Batter';
      // Bowler figures — charged runs (byes/leg-byes excluded), legal balls, wickets.
      let charged = 0, legal = false;
      if (et === 'wide') charged = b.extras;
      else if (et === 'noBall') charged = b.runs + b.extras;
      else if (et === 'bye' || et === 'legBye') legal = true;
      else if (et === 'penalty' || et === 'retired') charged = 0;
      else { charged = b.runs; legal = true; }
      if (bId) {
        bowl[bId].runs += charged;
        if (legal) bowl[bId].balls += 1;
        if (b.isWicket) {
          if (isBowlerWicket(b.wicketType)) bowl[bId].wkts += 1;
        }
      }
      overCharged += charged;
      if (legal) overLegal += 1;
      lastStriker = b.batterId; lastNon = b.nonStrikerId;
    }
    if (overLegal >= 6 && overCharged === 0 && overBowlers.size === 1) bowl[[...overBowlers][0]].maidens += 1;
    if (legalIn(over) >= 6) {   // completed over only
      const bw = bowl[lastBowlerId] || { name: 'Bowler', balls: 0, maidens: 0, runs: 0, wkts: 0 };
      out.push({
        over: over.overNumber,
        total: `${runningRuns}/${runningWkts}`,
        bat: [lastStriker, lastNon].filter(Boolean).map((id) => ({ name: batName[id] || 'Batter', runs: batRuns[id] || 0, balls: batBalls[id] || 0 })),
        // Standard O-M-R-W bowling figures, matching the format used across the app.
        bowler: { name: bw.name, fig: `${Math.floor(bw.balls / 6)}.${bw.balls % 6}-${bw.maidens}-${bw.runs}-${bw.wkts}` },
      });
    }
  }
  return out.reverse();
}

export default { computeOverEndSummaries };
