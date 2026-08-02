// MVP points — the accounting, pinned.
//
// The points are only trusted if they agree with the scorecard the players are
// reading. These cases fix the ball-by-ball accounting (runs off the bat, balls
// faced, runs charged, who bowled which delivery, maidens) to the same rules the
// frontend's computeBatting / computeBowling use.
//
//   node --test test/          (or: npm test)

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAwards, economyBonus, ECONOMY, RUN_OUT } from '../src/lib/mvp.js';

const T1 = { id: 't1', name: 'Mumbai' };
const T2 = { id: 't2', name: 'Sydney' };
const P = { rohit: 'p1', gill: 'p2', starc: 'p3', cummins: 'p4', maxwell: 'p5' };
const NAMES = { p1: 'Rohit', p2: 'Gill', p3: 'Starc', p4: 'Cummins', p5: 'Maxwell' };

// A delivery. Defaults to a legal dot from Starc to Rohit.
const ball = (o = {}) => ({
  runs: 0, extras: 0, extraType: null, isWicket: false, wicketType: null,
  dismissedPlayerId: null, wicketAssists: null,
  batterId: P.rohit, nonStrikerId: P.gill, batter: { name: 'Rohit' },
  ...o,
  ...(o.bowlerId ? { bowler: { name: NAMES[o.bowlerId] } } : {}),
});

const over = (overNumber, bowlerId, balls) => ({
  overNumber, bowlerId, bowler: { name: NAMES[bowlerId] },
  balls: balls.map((b, i) => ({ ballNumber: i + 1, ...b })),
});

const match = ({ overs = 20, oversData = [], totalRuns = 0, result = 'Mumbai won by 5 wickets' } = {}) => ({
  overs, result, team1: T1, team2: T2,
  squads: Object.entries(NAMES).map(([id, name]) => ({
    playerId: id, teamId: id === P.rohit || id === P.gill ? 't1' : 't2', player: { name },
  })),
  innings: [{
    inningNumber: 1, battingTeamId: 't1', bowlingTeamId: 't2', totalRuns,
    battingTeam: { name: T1.name }, bowlingTeam: { name: T2.name },
    oversData,
  }],
});

const by = (awards, name) => awards.mvp.find((p) => p.name === name);

test('runs off the bat on a no ball are the batter\'s', () => {
  // 4 off a no ball: 5 to the team, 4 to Rohit, all 5 charged to Starc.
  const a = computeAwards(match({
    totalRuns: 5,
    oversData: [over(1, P.starc, [ball({ runs: 4, extras: 1, extraType: 'noBall' })])],
  }));
  assert.equal(by(a, 'Rohit').batLine, '4 (1)');   // and a no ball IS a ball faced
  assert.equal(by(a, 'Starc').bowlLine, '0/5');
  assert.ok(by(a, 'Rohit').bat > 0, 'the batter must score points for those runs');
});

test('a wide is not a ball faced and not charged to the batter', () => {
  const a = computeAwards(match({
    totalRuns: 2,
    oversData: [over(1, P.starc, [ball({ extras: 2, extraType: 'wide' })])],
  }));
  assert.equal(by(a, 'Rohit').batLine, '0 (0)');
  assert.equal(by(a, 'Starc').bowlLine, '0/2');
});

test('byes and leg byes are faced by the batter but charged to nobody', () => {
  const a = computeAwards(match({
    totalRuns: 3,
    oversData: [over(1, P.starc, [
      ball({ extras: 1, extraType: 'bye' }),
      ball({ extras: 2, extraType: 'legBye' }),
    ])],
  }));
  assert.equal(by(a, 'Rohit').batLine, '0 (2)');   // faced both, scored neither
  assert.equal(by(a, 'Starc').bowlLine, '0/0');    // not the bowler's runs
});

test('a shared over splits by the delivery, not the over', () => {
  // Starc bowls 3, Cummins finishes it — and takes the wicket.
  const a = computeAwards(match({
    totalRuns: 6,
    oversData: [over(1, P.starc, [
      ball({ runs: 4, bowlerId: P.starc }),
      ball({ bowlerId: P.starc }),
      ball({ runs: 2, bowlerId: P.starc }),
      ball({ bowlerId: P.cummins }),
      ball({ bowlerId: P.cummins }),
      ball({ bowlerId: P.cummins, isWicket: true, wicketType: 'bowled', dismissedPlayerId: P.rohit }),
    ])],
  }));
  assert.equal(by(a, 'Starc').bowlLine, '0/6');
  assert.equal(by(a, 'Cummins').bowlLine, '1/0');
  assert.ok(by(a, 'Cummins').bowl > by(a, 'Starc').bowl, 'the wicket belongs to who bowled it');
});

test('a shared over is a maiden for neither bowler', () => {
  const dots = (bowlerId, n) => Array.from({ length: n }, () => ball({ bowlerId }));
  const shared = computeAwards(match({
    oversData: [over(1, P.starc, [...dots(P.starc, 3), ...dots(P.cummins, 3)])],
  }));
  assert.equal(by(shared, 'Starc').bowl, 0);
  assert.equal(by(shared, 'Cummins').bowl, 0);

  const whole = computeAwards(match({
    oversData: [over(1, P.starc, dots(P.starc, 6))],
  }));
  assert.ok(by(whole, 'Starc').bowl > 0, 'a maiden bowled by one bowler still scores');
});

test('a wicket taken before the ball was bowled costs nobody a delivery', () => {
  // Law 38.3 — stored as extraType 'deadBall'. It must not count as a ball faced,
  // a ball bowled, or one of the over's six.
  const a = computeAwards(match({
    totalRuns: 0,
    oversData: [over(1, P.starc, [
      ball({ extraType: 'deadBall', isWicket: true, wicketType: 'runout', dismissedPlayerId: P.gill, wicketAssists: 'Starc' }),
      ball({ runs: 6 }),
    ])],
  }));
  assert.equal(by(a, 'Rohit').batLine, '6 (1)');   // one ball faced, not two
  assert.equal(by(a, 'Starc').bowlLine, '0/6');
  assert.ok(by(a, 'Starc').field > 0, 'the run out is fielding credit, never a bowling wicket');
});

test('a run out is fielding points; a catch splits between bowler and fielder', () => {
  const a = computeAwards(match({
    totalRuns: 0,
    oversData: [over(1, P.starc, [
      ball({ isWicket: true, wicketType: 'caught', dismissedPlayerId: P.rohit, wicketAssists: 'Maxwell' }),
      ball({ batterId: P.gill, batter: { name: 'Gill' }, isWicket: true, wicketType: 'runout', dismissedPlayerId: P.gill, wicketAssists: 'Maxwell' }),
    ])],
  }));
  const max = by(a, 'Maxwell'), starc = by(a, 'Starc');
  assert.equal(max.fieldCount, 2);
  assert.equal(starc.bowlLine, '1/0', 'the run out is not the bowler\'s wicket');
  assert.ok(max.field > 0 && starc.bowl > 0);
});

test('batting + bowling + fielding always equals the total on screen', () => {
  const a = computeAwards(match({
    totalRuns: 17,
    oversData: [over(1, P.starc, [
      ball({ runs: 4 }), ball({ runs: 1, extras: 1, extraType: 'noBall' }),
      ball({ runs: 6 }), ball({ extras: 1, extraType: 'wide' }),
      ball({ runs: 3 }), ball({ extras: 1, extraType: 'legBye' }),
      ball({ isWicket: true, wicketType: 'caught', dismissedPlayerId: P.rohit, wicketAssists: 'Maxwell' }),
    ])],
  }));
  for (const p of a.mvp) {
    assert.equal(+(p.bat + p.bowl + p.field).toFixed(2), p.total, `${p.name}'s parts must add up`);
  }
});

// ── The bowler's economy bonus, as CricHeroes publish it ────────────────────
// (TeamSR / PlayerSR) × SR%, gated on TeamSR >= PlayerSR. Their published
// formula multiplies by (TeamSR − PlayerSR), but their own UPDATE replaces that
// factor with 1 or 0 — a gate, not a magnitude. Worked by hand so a change has
// to be deliberate.
test('economy bonus follows the published formula', () => {
  // T20 (8%), innings 160 off 120 balls → TeamSR 133.33.
  // Bowler 4-0-20-1 → 24 balls, PlayerSR 83.33. ratio 1.6 × 0.08 = 0.128
  const bonus = economyBonus({ teamSR: (160 / 120) * 100, playerSR: (20 / 24) * 100, srPct: 0.08, ballsBowled: 24 });
  assert.equal(+bonus.toFixed(4), 0.128);
});

// Equal strike rates: their update says the gate is 1 when the difference is
// >= 0, so a bowler exactly at the innings rate still earns the ratio (1).
test('a bowler level with the innings rate is gated in, not out', () => {
  const bonus = economyBonus({ teamSR: 133.33, playerSR: 133.33, srPct: 0.08, ballsBowled: 24 });
  assert.equal(+bonus.toFixed(4), 0.08);
});

// The regression this exists for. A real 8-over match: Kuldeep Yadav bowled ONE
// over for 11 and took NOTHING, and finished first on MVP with 8.45 — every
// point of it this bonus — ahead of a bowler who took three wickets in an over.
// Economy is worth something; it is not worth more than wickets.
test('a tidy wicketless over cannot outscore three wickets', () => {
  const srPct = 0.08;                       // 8 overs a side
  const teamSR = (124 / 48) * 100;          // the innings: 124 off 48 balls
  const tidy = economyBonus({ teamSR, playerSR: (11 / 6) * 100, srPct, ballsBowled: 6 });
  // Three wickets in an 8-over game: base 14 runs a wicket → 1.4 points each at
  // full positional weight, plus the 3-wicket milestone.
  const threeWickets = 3 * (14 / 10) + 0.5;
  assert.ok(tidy < threeWickets,
    `a wicketless over scored ${tidy.toFixed(2)} against ${threeWickets} for three wickets`);
  assert.ok(tidy > 0, 'tight bowling is still worth something');
  // And it must not even rival a single wicket.
  assert.ok(tidy < 14 / 10, `${tidy.toFixed(2)} is more than one wicket is worth`);
});

test('economy bonus only ever adds, and never for a bowler who did not bowl', () => {
  const srPct = 0.08, teamSR = 133.33;
  // Went at more than the innings rate → no bonus, and no penalty either.
  assert.equal(economyBonus({ teamSR, playerSR: 200, srPct, ballsBowled: 24 }), 0);
  // Didn't bowl a ball → nothing, however tidy the arithmetic looks.
  assert.equal(economyBonus({ teamSR, playerSR: 0, srPct, ballsBowled: 0 }), 0);
});

// CricHeroes are explicit about the maiden case: "in case of maiden overs, we
// can't calculate SR bonus as Player SR will be 0. So we have devised a
// different mechanism" — the maiden bonus. So this term pays nothing there
// rather than dividing by zero or paying twice.
test('a spell of nothing but maidens is paid by the maiden bonus, not this', () => {
  const b = economyBonus({ teamSR: 133.33, playerSR: 0, srPct: 0.08, ballsBowled: 6 });
  assert.equal(b, 0);
});

// The cap guards data, not scoring: it should only bite on a spell more
// economical than any real one.
test('the ratio cap keeps a freak spell finite', () => {
  const b = economyBonus({ teamSR: 133.33, playerSR: 0.001, srPct: 0.08, ballsBowled: 6 });
  assert.ok(Number.isFinite(b));
  assert.equal(+b.toFixed(4), +(ECONOMY.ratioCap * 0.08).toFixed(4));
});

test('every squad player is listed, ranked, even with nothing to show', () => {
  const a = computeAwards(match({ oversData: [] }));
  assert.equal(a.mvp.length, Object.keys(NAMES).length);
  const totals = a.mvp.map((p) => p.total);
  assert.deepEqual(totals, [...totals].sort((x, y) => y - x), 'ranked highest first');
});

// CricHeroes' tables each have a Test row that differs from their longest overs
// band — base runs per wicket is 25 for a Test, where 51-99 overs gives 27. A
// Test cannot be recognised by innings length, so it declares itself.
test('a Test match uses its own base runs per wicket, not the 51-99 band', () => {
  const wicketValue = (matchType) => {
    const m = match({
      overs: 90,
      oversData: [over(1, P.starc, [
        ball({ isWicket: true, wicketType: 'bowled', dismissedPlayerId: P.rohit }),
      ])],
    });
    const a = computeAwards({ ...m, matchType });
    return by(a, 'Starc').bowl;
  };
  const long = wicketValue('ODI');    // 90 overs, not a Test → 27 runs a wicket
  const test = wicketValue('Test');   // → 25 runs a wicket
  assert.ok(long > 0 && test > 0, 'both should score for the wicket');
  assert.equal(+long.toFixed(2), 2.7);
  assert.equal(+test.toFixed(2), 2.5);
});

// CricHeroes pay a run-out fielder full points "if it is a direct hit". One
// that isn't took two people and we only record one, so they get a share.
test('a direct-hit run out pays the fielder more than a shared one', () => {
  const runOut = (directHit) => {
    const a = computeAwards(match({
      oversData: [over(1, P.starc, [ball({
        isWicket: true, wicketType: 'runout',
        dismissedPlayerId: P.rohit, wicketAssists: 'Maxwell', directHit,
      })])],
    }));
    return by(a, 'Maxwell').field;
  };
  const direct = runOut(true);
  const shared = runOut(false);
  const unrecorded = runOut(null);       // every ball before the column existed
  assert.ok(direct > 0, 'a direct hit must score');
  assert.equal(+shared.toFixed(4), +(direct * RUN_OUT.sharedHit).toFixed(4));
  assert.equal(unrecorded, direct, 'not recorded must score exactly as it always did');
});
