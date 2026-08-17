// The laws the app counts by — locked down.
//
// Every bug found in the cricket audit had one shape: a rule written out in more
// than one file, drifting in one copy. Nine of them, across both halves of the
// app. Fixing them centralised the rules; these tests are what stops them being
// re-typed, because a comment saying "use deliveries.js" has demonstrably not
// been enough.
//
// The four questions below LOOK like one question and are not. A no ball answers
// differently to three of them, which is why nearly every bug involved one:
//
//   isLegalDelivery  does this advance the over?     no ball: NO
//   isBallFaced      did the batter face it?         no ball: YES
//   offTheBat        are the runs the batter's?      no ball: YES
//   isBowlerWicket   is this wicket the bowler's?    (independent of all three)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLegalDelivery, isBallFaced, offTheBat, batRuns, isBowlerWicket,
  NON_BALL_EXTRAS, LEGAL_DELIVERY_WHERE, BOWLER_WICKET_WHERE,
  inningsPhase, bowlingKind, oversNotation, oversDecimal,
} from '../src/lib/deliveries.js';

const EVERY_EXTRA = [null, 'wide', 'noBall', 'bye', 'legBye', 'penalty', 'retired', 'deadBall'];

describe('what counts as a delivery', () => {
  test('a no ball is faced and pays the batter, but does NOT advance the over', () => {
    const nb = { extraType: 'noBall', runs: 4 };
    assert.equal(isLegalDelivery(nb), false, 'a no ball is re-bowled');
    assert.equal(isBallFaced(nb), true, 'the batter still faced it');
    assert.equal(offTheBat(nb), true, 'runs off a no ball are the batter\'s');
    assert.equal(batRuns(nb), 4);
  });

  test('a wide is none of the three', () => {
    const w = { extraType: 'wide', runs: 0, extras: 2 };
    assert.equal(isLegalDelivery(w), false);
    assert.equal(isBallFaced(w), false, 'the batter could not reach it');
    assert.equal(offTheBat(w), false);
    assert.equal(batRuns(w), 0);
  });

  test('byes and leg byes advance the over and are faced, but are not the batter\'s runs', () => {
    for (const et of ['bye', 'legBye']) {
      const b = { extraType: et, runs: 0, extras: 2 };
      assert.equal(isLegalDelivery(b), true, `${et} advances the over`);
      assert.equal(isBallFaced(b), true, `${et} was faced`);
      assert.equal(offTheBat(b), false, `${et} did not come off the bat`);
    }
  });

  test('penalties, retirements and dead balls are not deliveries and were not faced', () => {
    // All three are stored with the striker's id on them, which is exactly how
    // they end up wrongly inflating a strike rate's denominator.
    for (const et of ['penalty', 'retired', 'deadBall']) {
      const b = { extraType: et, runs: 0 };
      assert.equal(isLegalDelivery(b), false, `${et} is not a delivery`);
      assert.equal(isBallFaced(b), false, `${et} was not faced`);
      assert.equal(offTheBat(b), false);
    }
  });

  test('an ordinary ball is all three', () => {
    const b = { extraType: null, runs: 1 };
    assert.equal(isLegalDelivery(b), true);
    assert.equal(isBallFaced(b), true);
    assert.equal(offTheBat(b), true);
    assert.equal(batRuns(b), 1);
  });

  test('the three questions are answered for every extra type without throwing', () => {
    for (const et of EVERY_EXTRA) {
      const b = { extraType: et, runs: 2, extras: 1 };
      assert.equal(typeof isLegalDelivery(b), 'boolean', String(et));
      assert.equal(typeof isBallFaced(b), 'boolean', String(et));
      assert.equal(typeof offTheBat(b), 'boolean', String(et));
    }
  });

  test('null and undefined balls do not crash the rules', () => {
    for (const fn of [isLegalDelivery, isBallFaced, offTheBat]) {
      assert.doesNotThrow(() => fn(null));
      assert.doesNotThrow(() => fn(undefined));
    }
    assert.equal(batRuns(null), 0);
  });
});

describe('boundaries', () => {
  // teamStats.js counted `!extraType && runs === 4`, which drops a four struck
  // off a no ball. Two of those exist in production; they were a four on the
  // career page and not a four on the team page.
  test('a four off a no ball IS the batter\'s four', () => {
    const b = { extraType: 'noBall', runs: 4 };
    assert.equal(offTheBat(b) && b.runs === 4, true);
  });

  test('four byes are nobody\'s boundary', () => {
    const b = { extraType: 'bye', runs: 0, extras: 4 };
    assert.equal(offTheBat(b) && b.runs === 4, false);
  });

  test('a wide that runs away for four is not a boundary off the bat', () => {
    const b = { extraType: 'wide', runs: 0, extras: 5 };
    assert.equal(offTheBat(b), false);
  });
});

describe('whose wicket is it', () => {
  test('the bowler gets bowled, caught, lbw, stumped and hit wicket', () => {
    for (const wt of ['bowled', 'caught', 'lbw', 'stumped', 'hitwicket']) {
      assert.equal(isBowlerWicket({ isWicket: true, wicketType: wt }), true, wt);
    }
  });

  test('the bowler gets none of the run outs or retirements', () => {
    for (const wt of ['runout', 'retired', 'retiredout', 'retiredhurt']) {
      assert.equal(isBowlerWicket({ isWicket: true, wicketType: wt }), false, wt);
    }
  });

  test('the bowler gets none of the three the Laws credit to nobody', () => {
    // Added to the scoring screen during this audit. isBowlerWicket defaults to
    // "the bowler's", so these had to be excluded BEFORE they were offerable or
    // a bowler would have been handed a wicket for a batter who timed out.
    for (const wt of ['obstructing', 'obstructingthefield', 'timedout', 'hitballtwice', 'hittheballtwice']) {
      assert.equal(isBowlerWicket({ isWicket: true, wicketType: wt }), false, wt);
    }
  });

  test('casing and spacing never change the answer', () => {
    // The original bug: the scorer writes 'runout' and five files compared
    // against 'runOut', so every run out was silently credited to the bowler.
    for (const wt of ['RunOut', 'run out', 'RUN OUT', 'Run Out', ' runout ']) {
      assert.equal(isBowlerWicket({ isWicket: true, wicketType: wt }), false, wt);
    }
    assert.equal(isBowlerWicket({ isWicket: true, wicketType: 'Hit Wicket' }), true);
  });

  test('a wicket with no type recorded still counts to the bowler', () => {
    assert.equal(isBowlerWicket({ isWicket: true, wicketType: null }), true);
    assert.equal(isBowlerWicket({ isWicket: true, wicketType: '' }), true);
  });

  test('a ball that is not a wicket is never anybody\'s wicket', () => {
    assert.equal(isBowlerWicket({ isWicket: false, wicketType: 'bowled' }), false);
    assert.equal(isBowlerWicket(null), false);
  });
});

describe('the Prisma filters agree with the predicates', () => {
  // A query and the function beside it disagreeing is how the leaderboard came
  // to count a dead ball as a delivery while nothing else did.
  test('LEGAL_DELIVERY_WHERE excludes exactly NON_BALL_EXTRAS', () => {
    assert.deepEqual(LEGAL_DELIVERY_WHERE.OR[1].extraType.notIn, NON_BALL_EXTRAS);
  });

  test('LEGAL_DELIVERY_WHERE matches balls with no extraType', () => {
    // notIn excludes NULLs in SQL, so the null branch is load-bearing.
    assert.deepEqual(LEGAL_DELIVERY_WHERE.OR[0], { extraType: null });
  });

  test('the filter and the predicate classify every extra type the same way', () => {
    const excluded = new Set(LEGAL_DELIVERY_WHERE.OR[1].extraType.notIn);
    for (const et of EVERY_EXTRA) {
      const byQuery = et === null ? true : !excluded.has(et);
      assert.equal(byQuery, isLegalDelivery({ extraType: et }), String(et));
    }
  });

  test('BOWLER_WICKET_WHERE keeps null wicketTypes, matching isBowlerWicket', () => {
    assert.equal(BOWLER_WICKET_WHERE.isWicket, true);
    assert.deepEqual(BOWLER_WICKET_WHERE.OR[0], { wicketType: null });
  });
});

describe('overs arithmetic', () => {
  test('notation is base six, not decimal', () => {
    assert.equal(oversNotation(0), '0.0');
    assert.equal(oversNotation(5), '0.5');
    assert.equal(oversNotation(6), '1.0');
    assert.equal(oversNotation(51), '8.3');
  });

  test('arithmetic uses true decimals — 51 balls is eight and a half overs', () => {
    // Feeding the notation into a division is the classic way to get a run rate
    // that is quietly wrong all season.
    assert.equal(oversDecimal(51), 8.5);
    assert.equal(oversDecimal(6), 1);
    assert.equal(oversDecimal(3), 0.5);
  });

  test('an economy off notation would differ from one off the decimal', () => {
    const runs = 68, balls = 51;
    const right = runs / oversDecimal(balls);
    const wrong = runs / parseFloat(oversNotation(balls));
    assert.notEqual(right.toFixed(2), wrong.toFixed(2), 'the two must not be interchangeable');
  });
});

describe('innings phases', () => {
  test('a T20 splits 1-6 / 7-15 / 16-20, the convention a player already has', () => {
    const phase = (o) => inningsPhase(o, 20);
    assert.equal(phase(1), 'powerplay');
    assert.equal(phase(6), 'powerplay');
    assert.equal(phase(7), 'middle');
    assert.equal(phase(15), 'middle');
    assert.equal(phase(16), 'death');
    assert.equal(phase(20), 'death');
  });

  test('phases are proportional, so a T10 is not given a T20\'s powerplay', () => {
    assert.equal(inningsPhase(3, 10), 'powerplay');
    assert.equal(inningsPhase(4, 10), 'middle');
    assert.equal(inningsPhase(8, 10), 'death');
  });

  test('a match too short to have phases reports none rather than guessing', () => {
    assert.equal(inningsPhase(1, 2), null);
    assert.equal(inningsPhase(1, null), null);
    assert.equal(inningsPhase(null, 20), null);
  });
});

describe('pace or spin, from free text', () => {
  test('reads the spellings people actually type', () => {
    for (const s of ['Right-arm offbreak', 'SLA', 'left arm orthodox', 'Leg break googly', 'Slow left-arm chinaman']) {
      assert.equal(bowlingKind(s), 'spin', s);
    }
    for (const s of ['Right arm fast', 'medium fast', 'Right-arm medium', 'left arm seam']) {
      assert.equal(bowlingKind(s), 'pace', s);
    }
  });

  test('spin wins over pace words, because "slow left-arm" is spin', () => {
    assert.equal(bowlingKind('slow left-arm medium'), 'spin');
    assert.equal(bowlingKind('leg break medium'), 'spin');
  });

  test('an unreadable style is NULL, never guessed as pace', () => {
    // Most players here have no bowling style recorded. A "struggles against
    // spin" built out of blanks is worse than no answer.
    for (const s of ['', null, undefined, 'right arm', 'Wicketkeeper', 'all rounder']) {
      assert.equal(bowlingKind(s), null, JSON.stringify(s));
    }
  });
});
