#!/usr/bin/env node
/**
 * Calibrate our bowling MVP points against a real CricHeroes scorecard.
 *
 * Their published economy term leaves two things undefined — the scale of the
 * strike rates, and what happens at zero runs conceded (see ECONOMY in
 * src/lib/mvp.js). Rather than guess, take ONE bowler off a CricHeroes match,
 * feed their figures in with the points CricHeroes gave them, and this prints
 * what each reading produces and which one reproduces the number.
 *
 *   node scripts/mvp-calibrate.mjs \
 *     --overs 20 --team-runs 160 --team-balls 120 \
 *     --balls 24 --runs 20 --wickets 1 --maidens 0 --pos 3,7 \
 *     --expected 8.2
 *
 *   --overs        overs per side in that match (picks the points tables)
 *   --team-runs    the innings total this bowler bowled in
 *   --team-balls   legal balls in that innings (overs × 6)
 *   --balls        legal balls this bowler bowled   (4 overs = 24)
 *   --runs         runs charged to this bowler
 *   --wickets      wickets credited to the bowler (not run-outs)
 *   --maidens      maiden overs
 *   --pos          batting positions of the batters they dismissed, e.g. 3,7
 *                  (defaults to mid-order for each wicket)
 *   --expected     the MVP bowling points CricHeroes shows for them
 */

import { economyBonus, ECONOMY } from '../src/lib/mvp.js';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/))
    .map(([k, ...v]) => [k, v.join(' ')]),
);
const n = (k, d) => (args[k] === undefined ? d : Number(args[k]));

// Same tables as src/lib/mvp.js — imported would be better, but they aren't
// exported and this script must not change the module's public surface.
const baseRunsPerWicket = (ov) =>
  ov <= 7 ? 12 : ov <= 12 ? 14 : ov <= 16 ? 16 : ov <= 20 ? 18 :
  ov <= 26 ? 20 : ov <= 40 ? 22 : ov <= 50 ? 25 : 27;
const maidensPerWicket = (ov) => (ov <= 7 ? 1 : ov <= 26 ? 2 : ov <= 50 ? 3 : 6);
const srBonusPct = (ov) => (ov <= 20 ? 0.08 : ov <= 35 ? 0.06 : ov <= 50 ? 0.04 : 0.02);
const posFactor = (p) => (p <= 4 ? 1 : p <= 8 ? 0.8 : 0.6);

const overs = n('overs', 20);
const teamRuns = n('team-runs', 0);
const teamBalls = n('team-balls', overs * 6);
const balls = n('balls', 0);
const runs = n('runs', 0);
const wickets = n('wickets', 0);
const maidens = n('maidens', 0);
const expected = args.expected === undefined ? null : Number(args.expected);

const positions = (args.pos ? args.pos.split(',').map(Number) : [])
  .concat(Array.from({ length: Math.max(0, wickets - (args.pos ? args.pos.split(',').length : 0)) }, () => 6))
  .slice(0, wickets);

const brpw = baseRunsPerWicket(overs);
const mpw = maidensPerWicket(overs);
const srPct = srBonusPct(overs);
const teamSR = teamBalls > 0 ? (teamRuns / teamBalls) * 100 : 0;
const playerSR = balls > 0 ? (runs / balls) * 100 : 0;

const wicketBase = positions.reduce((acc, p) => acc + (brpw * posFactor(p)) / 10, 0);
const milestone = wickets >= 10 ? 1.5 : wickets >= 5 ? 1 : wickets >= 3 ? 0.5 : 0;
const maidenBonus = maidens * ((brpw / 10) / mpw);
const fixed = wicketBase + milestone + maidenBonus;

const f = (x) => x.toFixed(2).padStart(7);
console.log(`\nMatch: ${overs} overs · team ${teamRuns}/${teamBalls} balls → team SR ${teamSR.toFixed(2)}`);
console.log(`Bowler: ${Math.floor(balls / 6)}.${balls % 6}-${maidens}-${runs}-${wickets} → player SR ${playerSR.toFixed(2)}`);
console.log(`Tables: base runs/wicket ${brpw} · maidens/wicket ${mpw} · SR bonus ${srPct * 100}%`);
console.log(`\nFixed part  wickets ${f(wicketBase)} + milestone ${f(milestone)} + maidens ${f(maidenBonus)} = ${f(fixed)}`);

console.log('\nreading                       economy      total   vs expected');
const readings = [
  ['published as written (÷1)', 1],
  ['converted at 10 runs = 1pt', 10],
];
const original = ECONOMY.divisor;
for (const [label, divisor] of readings) {
  ECONOMY.divisor = divisor;
  const econ = economyBonus({ teamSR, playerSR, srPct, ballsBowled: balls });
  const total = fixed + econ;
  const verdict = expected === null ? '' : Math.abs(total - expected) < 0.05 ? '  ← MATCHES' : `  off by ${(total - expected).toFixed(2)}`;
  console.log(`${label.padEnd(28)} ${f(econ)}  ${f(total)}${verdict}`);
}
ECONOMY.divisor = original;

if (expected === null) {
  console.log('\nPass --expected <points> with the figure from CricHeroes to see which reading matches.');
} else {
  console.log(`\nCricHeroes says ${expected}. Set ECONOMY.divisor in src/lib/mvp.js to whichever reading matches.`);
  console.log('If neither is close, send the row — the difference is somewhere else in the algorithm.');
}
console.log();
