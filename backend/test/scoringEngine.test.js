// A whole innings, scored ball by ball, with every figure checked by hand.
//
// The rule tests next door check each law in isolation. This one checks what
// happens when they interact, which is where the real faults were: a delivery
// that is not legal but IS faced and DOES pay the batter (a no ball) touches
// four different counters, and nearly every bug found in the audit came from
// one counter using another counter's rule.
//
// Figures here are worked out by hand in the comments, not by running the code
// and writing down what it said. A test that agrees with the implementation by
// construction proves nothing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isLegalDelivery, isBallFaced, offTheBat, isBowlerWicket } from '../src/lib/deliveries.js';

/** Score an innings from a list of deliveries, the way the app's aggregates do. */
function scoreInnings(balls) {
  const bat = {};
  const bowl = {};
  let total = 0;
  let wickets = 0;
  let legal = 0;
  const extras = { wide: 0, noBall: 0, bye: 0, legBye: 0, penalty: 0 };

  for (const b of balls) {
    const B = (bat[b.batter] ||= { runs: 0, balls: 0, fours: 0, sixes: 0, out: false });
    const W = (bowl[b.bowler] ||= { balls: 0, runs: 0, wickets: 0, maidens: 0 });

    total += (b.runs || 0) + (b.extras || 0);
    if (b.extraType && extras[b.extraType] !== undefined) extras[b.extraType] += (b.extras || 0);

    if (isBallFaced(b)) B.balls += 1;
    if (offTheBat(b)) {
      B.runs += b.runs || 0;
      if (b.runs === 4) B.fours += 1;
      if (b.runs === 6) B.sixes += 1;
    }
    if (isLegalDelivery(b)) { W.balls += 1; legal += 1; }

    // Charged to the bowler: bat runs plus the wide/no-ball penalties. Byes and
    // leg byes went past the bat and are not his to answer for.
    if (b.extraType === 'wide') W.runs += b.extras || 0;
    else if (b.extraType === 'noBall') W.runs += (b.runs || 0) + (b.extras || 0);
    else if (!b.extraType) W.runs += b.runs || 0;

    if (b.isWicket) {
      wickets += 1;
      if (b.dismissed) (bat[b.dismissed] ||= { runs: 0, balls: 0, fours: 0, sixes: 0 }).out = true;
      if (isBowlerWicket(b)) W.wickets += 1;
    }
  }
  return { bat, bowl, total, wickets, legal, extras };
}

const sr = (r, b) => (b ? Math.round((r / b) * 100) : null);
const econ = (r, balls) => (balls ? +(r / (balls / 6)).toFixed(2) : null);

describe('a full over, every delivery type', () => {
  // Kohli facing Bumrah. By hand:
  //   1  no ball, 4 off the bat  -> bat 4 (1 faced, 1 four), bowler 5, NOT legal
  //   2  wide + 1 run run        -> bat 0 (not faced),       bowler 2, NOT legal
  //   3  dot                     -> bat 0 (1 faced),         bowler 0, legal
  //   4  2 byes                  -> bat 0 (1 faced),         bowler 0, legal
  //   5  six                     -> bat 6 (1 faced, 1 six),  bowler 6, legal
  //   6  1 leg bye               -> bat 0 (1 faced),         bowler 0, legal
  //   7  single                  -> bat 1 (1 faced),         bowler 1, legal
  //   8  bowled                  -> bat 0 (1 faced),         bowler 0, legal, WICKET
  const over = [
    { batter: 'K', bowler: 'B', extraType: 'noBall', runs: 4, extras: 1 },
    { batter: 'K', bowler: 'B', extraType: 'wide',   runs: 0, extras: 2 },
    { batter: 'K', bowler: 'B', extraType: null,     runs: 0, extras: 0 },
    { batter: 'K', bowler: 'B', extraType: 'bye',    runs: 0, extras: 2 },
    { batter: 'K', bowler: 'B', extraType: null,     runs: 6, extras: 0 },
    { batter: 'K', bowler: 'B', extraType: 'legBye', runs: 0, extras: 1 },
    { batter: 'K', bowler: 'B', extraType: null,     runs: 1, extras: 0 },
    { batter: 'K', bowler: 'B', extraType: null,     runs: 0, extras: 0, isWicket: true, wicketType: 'bowled', dismissed: 'K' },
  ];
  const s = scoreInnings(over);

  test('the over is complete at six LEGAL balls, not eight deliveries', () => {
    assert.equal(s.legal, 6, 'the no ball and the wide are re-bowled');
    assert.equal(s.bowl.B.balls, 6);
  });

  test('the team total counts everything that happened', () => {
    // 5 (nb+4) + 2 (wd) + 0 + 2 (b) + 6 + 1 (lb) + 1 + 0 = 17
    assert.equal(s.total, 17);
  });

  test('the batter is credited only with runs off the bat', () => {
    assert.equal(s.bat.K.runs, 11, '4 off the no ball + 6 + 1');
    assert.equal(s.bat.K.fours, 1, 'the four off the no ball IS a four');
    assert.equal(s.bat.K.sixes, 1);
  });

  test('the batter faced everything except the wide', () => {
    assert.equal(s.bat.K.balls, 7, 'eight deliveries, minus the wide');
  });

  test('strike rate is over balls faced, and the no ball counts', () => {
    assert.equal(sr(s.bat.K.runs, s.bat.K.balls), 157);   // 11/7
  });

  test('the bowler is charged for his own extras but not for byes', () => {
    // 5 (nb) + 2 (wd) + 0 + 0 (bye) + 6 + 0 (leg bye) + 1 + 0 = 14
    assert.equal(s.bowl.B.runs, 14);
    assert.notEqual(s.bowl.B.runs, s.total, 'three of the seventeen were not his');
  });

  test('economy divides by true overs, not by the ball count', () => {
    assert.equal(econ(s.bowl.B.runs, s.bowl.B.balls), 14);   // 14 in exactly 1 over
  });

  test('extras are broken down by kind', () => {
    assert.deepEqual(s.extras, { wide: 2, noBall: 1, bye: 2, legBye: 1, penalty: 0 });
  });

  test('the wicket is the bowler\'s and the batter is out', () => {
    assert.equal(s.wickets, 1);
    assert.equal(s.bowl.B.wickets, 1);
    assert.equal(s.bat.K.out, true);
  });
});

describe('maiden overs', () => {
  const dots = (n, extra = {}) => Array.from({ length: n }, () => ({ batter: 'K', bowler: 'B', extraType: null, runs: 0, extras: 0, ...extra }));

  test('six dots is a maiden', () => {
    const s = scoreInnings(dots(6));
    assert.equal(s.bowl.B.runs, 0);
    assert.equal(s.bowl.B.balls, 6);
  });

  test('an over with byes is STILL a maiden — they are not charged to him', () => {
    // The bowler conceded nothing. Four byes went to the team, not to him.
    const balls = [...dots(5), { batter: 'K', bowler: 'B', extraType: 'bye', runs: 0, extras: 4 }];
    const s = scoreInnings(balls);
    assert.equal(s.bowl.B.runs, 0, 'a maiden');
    assert.equal(s.total, 4, 'but the team scored four');
  });

  test('an over with a wide is NOT a maiden, even if nothing else is scored', () => {
    const balls = [...dots(6), { batter: 'K', bowler: 'B', extraType: 'wide', runs: 0, extras: 1 }];
    const s = scoreInnings(balls);
    assert.equal(s.bowl.B.runs, 1, 'the wide is his');
  });
});

describe('wickets and who gets them', () => {
  const wicket = (wt) => scoreInnings([
    { batter: 'K', bowler: 'B', extraType: null, runs: 0, extras: 0, isWicket: true, wicketType: wt, dismissed: 'K' },
  ]);

  test('a run out counts against the team but not the bowler', () => {
    const s = wicket('runout');
    assert.equal(s.wickets, 1, 'the team is one down');
    assert.equal(s.bowl.B.wickets, 0, 'the bowler did not take it');
  });

  test('a retired-out is a wicket for the team and nobody\'s bowling figure', () => {
    const s = wicket('retiredout');
    assert.equal(s.wickets, 1);
    assert.equal(s.bowl.B.wickets, 0);
  });

  test('obstructing, timed out and hit-ball-twice are the same', () => {
    for (const wt of ['obstructing', 'timedout', 'hitballtwice']) {
      const s = wicket(wt);
      assert.equal(s.wickets, 1, wt);
      assert.equal(s.bowl.B.wickets, 0, wt);
    }
  });

  test('a stumping off a wide: the wicket stands, the ball is still not legal', () => {
    // Legal under the Laws, and the app supports it — a delivery that dismisses
    // a batter without advancing the over.
    const s = scoreInnings([
      { batter: 'K', bowler: 'B', extraType: 'wide', runs: 0, extras: 1, isWicket: true, wicketType: 'stumped', dismissed: 'K' },
    ]);
    assert.equal(s.wickets, 1);
    assert.equal(s.bowl.B.wickets, 1, 'a stumping is the bowler\'s');
    assert.equal(s.legal, 0, 'but the over has not advanced');
    assert.equal(s.bowl.B.runs, 1, 'and the wide is still charged');
  });

  test('a run out off a no ball: bat runs stand, bowler gets no wicket', () => {
    const s = scoreInnings([
      { batter: 'K', bowler: 'B', extraType: 'noBall', runs: 2, extras: 1, isWicket: true, wicketType: 'runout', dismissed: 'K' },
    ]);
    assert.equal(s.bat.K.runs, 2, 'runs off the bat on a no ball are the batter\'s');
    assert.equal(s.bowl.B.runs, 3, '2 off the bat + the no-ball penalty');
    assert.equal(s.bowl.B.wickets, 0);
    assert.equal(s.legal, 0);
  });
});

describe('the chase', () => {
  const target = 121;                       // chasing 120, so 121 to win
  const decide = (runs, wkts, ballsLeft, allOutAt = 10) => {
    if (runs >= target) return 'chase won';
    if (wkts >= allOutAt) return runs === target - 1 ? 'tie' : 'defended';
    if (ballsLeft === 0) return runs === target - 1 ? 'tie' : 'defended';
    return 'in progress';
  };

  test('reaching the target ends it immediately, balls remaining or not', () => {
    assert.equal(decide(121, 4, 30), 'chase won');
    assert.equal(decide(121, 9, 0), 'chase won');
  });

  test('one short with the last wicket down is a defeat, not a tie', () => {
    assert.equal(decide(119, 10, 5), 'defended');
  });

  test('level scores with no wickets or balls left is a TIE', () => {
    assert.equal(decide(120, 10, 12), 'tie');
    assert.equal(decide(120, 4, 0), 'tie');
  });

  test('all out is one short of the XI, and an eight-a-side is all out at 7', () => {
    // Ten was hardcoded in six places once; local cricket plays eight a side.
    assert.equal(decide(50, 7, 20, 7), 'defended');
    assert.equal(decide(50, 6, 20, 7), 'in progress');
  });
});

describe('a batter who is never dismissed', () => {
  test('not out is not the same as an average of runs', () => {
    const s = scoreInnings([
      { batter: 'K', bowler: 'B', extraType: null, runs: 4, extras: 0 },
      { batter: 'K', bowler: 'B', extraType: null, runs: 6, extras: 0 },
    ]);
    assert.equal(s.bat.K.runs, 10);
    assert.equal(s.bat.K.out, false, 'still in');
    assert.equal(sr(10, 2), 500);
  });
});
