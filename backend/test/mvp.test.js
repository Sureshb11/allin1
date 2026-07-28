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
import { computeAwards } from '../src/lib/mvp.js';

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

test('every squad player is listed, ranked, even with nothing to show', () => {
  const a = computeAwards(match({ oversData: [] }));
  assert.equal(a.mvp.length, Object.keys(NAMES).length);
  const totals = a.mvp.map((p) => p.total);
  assert.deepEqual(totals, [...totals].sort((x, y) => y - x), 'ranked highest first');
});
