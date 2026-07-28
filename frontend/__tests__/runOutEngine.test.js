/**
 * Run-out engine — the Laws, as test cases.
 *
 * Each table row is one match situation a scorer can actually hit, with the exact
 * book entry it must produce. Grouped the way the MCC Laws split them: the Wide
 * combinations, the No ball combinations, legal deliveries (including byes and
 * leg byes), the crease/strike matrix, and the inputs that must be refused.
 */

import {
  resolveRunOut, resolveEnds, ballChip, runOutCommentary,
  chipRuns, overRuns, isWicketChip,
  DELIVERY, RUNS, END,
} from '../src/utils/runOutEngine';

// Only the fields a row asserts on are compared, so a row stays readable.
const check = (out, expected) => {
  Object.entries(expected).forEach(([k, v]) => expect({ [k]: out[k] }).toEqual({ [k]: v }));
};

const run = (over) => resolveRunOut(over);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — WIDE + RUN OUT (Laws 22.4, 22.5, 22.7, 38.1)
// The Wide penalty always stands; every run RUN off a Wide is a Wide extra; the
// ball is never one of the over's six; nothing is ever credited to the bat.
// ─────────────────────────────────────────────────────────────────────────────
describe('Wide + run out', () => {
  const cases = [
    ['wide, no run completed, striker out',        { runsCompleted: 0, outSlot: END.STRIKER },     { teamRuns: 1, extras: 1, batRuns: 0, extraType: 'wide', countsAsBall: false, chip: 'WD+W', chargedToBowler: 1, ballFaced: 0 }],
    ['wide, no run completed, non-striker out',    { runsCompleted: 0, outSlot: END.NONSTRIKER },  { teamRuns: 1, extras: 1, countsAsBall: false, chip: 'WD+W' }],
    ['wide + 1 completed',                         { runsCompleted: 1 },                            { teamRuns: 2, extras: 2, chip: '2wd+W', chargedToBowler: 2 }],
    ['wide + 2 completed',                         { runsCompleted: 2 },                            { teamRuns: 3, extras: 3, chip: '3wd+W', chargedToBowler: 3 }],
    ['wide + 3 completed',                         { runsCompleted: 3 },                            { teamRuns: 4, extras: 4, chip: '4wd+W' }],
    ['wide + 4 completed (all run)',               { runsCompleted: 4 },                            { teamRuns: 5, extras: 5, chip: '5wd+W' }],
    ['wide + 5 completed (overthrows run)',        { runsCompleted: 5 },                            { teamRuns: 6, extras: 6, chip: '6wd+W' }],
    ['wide, keeper run out at striker\'s end',     { dismissalEnd: END.STRIKER },                   { newBatterEnd: END.STRIKER, survivorAtStrikerEnd: false }],
    ['wide, run out at the bowler\'s end',         { dismissalEnd: END.NONSTRIKER },                { newBatterEnd: END.NONSTRIKER, survivorAtStrikerEnd: true }],
    ['wide, bat runs are booked as wide extras',   { runsCompleted: 2, runsType: RUNS.BAT },        { batRuns: 0, extras: 3, valid: true, creditedAs: 'wide' }],
    ['wide, byes are booked as wide extras',       { runsCompleted: 2, runsType: RUNS.BYE },        { batRuns: 0, extras: 3, extraType: 'wide', valid: true }],
    ['wide never counts toward the over',          { ballsInOverBefore: 5 },                        { countsAsBall: false, ballsInOverAfter: 5, overComplete: false }],
    ['wide, last ball of the over stays incomplete',{ ballsInOverBefore: 5, runsCompleted: 1, dismissalEnd: END.NONSTRIKER }, { overComplete: false, nextStrikerIs: 'survivor' }],
    ['wide keeps a free hit alive',                { freeHit: true },                               { freeHitNext: true }],
    ['wide does not create a free hit',            { freeHit: false },                              { freeHitNext: false }],
    ['wide, run out is never the bowler\'s wicket',{},                                              { wicketToBowler: false, wicketType: 'runout' }],
    ['wide + short run docked',                    { runsCompleted: 2, shortRuns: 1 },              { teamRuns: 2, extras: 2, runsCompleted: 1 }],
  ];
  test.each(cases)('%s', (_name, input, expected) => {
    check(run({ delivery: DELIVERY.WIDE, ...input }), expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — NO BALL + RUN OUT (Laws 21.4, 21.13, 21.18, 38.1, 38.3)
// The No ball penalty always stands; runs off the bat are the striker's; runs
// NOT off the bat are still No ball extras; the ball is never one of the six;
// the striker is protected from everything except a run out.
// ─────────────────────────────────────────────────────────────────────────────
describe('No ball + run out', () => {
  const cases = [
    ['no ball, no run, striker out',          { runsCompleted: 0 },                               { teamRuns: 1, batRuns: 0, extras: 1, extraType: 'noBall', countsAsBall: false, chip: 'NB+W', ballFaced: 1, chargedToBowler: 1 }],
    ['no ball + 1 off the bat',               { runsCompleted: 1 },                               { teamRuns: 2, batRuns: 1, extras: 1, chip: '2nb+W', chargedToBowler: 2 }],
    ['no ball + 2 off the bat',               { runsCompleted: 2 },                               { teamRuns: 3, batRuns: 2, extras: 1, chip: '3nb+W' }],
    ['no ball + 3 off the bat',               { runsCompleted: 3 },                               { teamRuns: 4, batRuns: 3, chip: '4nb+W' }],
    ['no ball + 4 run (overthrows)',          { runsCompleted: 4 },                               { teamRuns: 5, batRuns: 4, chip: '5nb+W' }],
    ['no ball + 1 bye → no ball extras',      { runsCompleted: 1, runsType: RUNS.BYE },           { teamRuns: 2, batRuns: 0, extras: 2, extraType: 'noBall', chip: '2nb+W', creditedAs: 'noball' }],
    ['no ball + 2 leg byes → no ball extras', { runsCompleted: 2, runsType: RUNS.LEGBYE },        { teamRuns: 3, batRuns: 0, extras: 3, extraType: 'noBall', chip: '3nb+W' }],
    ['no ball is a ball faced',               { runsCompleted: 0 },                               { ballFaced: 1 }],
    ['no ball never counts toward the over',  { ballsInOverBefore: 5 },                           { countsAsBall: false, ballsInOverAfter: 5, overComplete: false }],
    ['no ball sets the next free hit',        { freeHit: false },                                 { freeHitNext: true }],
    ['free-hit no ball keeps the free hit',   { freeHit: true },                                  { freeHitNext: true }],
    ['no ball, striker run out at far end',   { dismissalEnd: END.NONSTRIKER },                   { newBatterEnd: END.NONSTRIKER, nextStrikerIs: 'survivor' }],
    ['no ball, striker beaten turning back',  { dismissalEnd: END.STRIKER },                      { newBatterEnd: END.STRIKER, nextStrikerIs: 'new' }],
    ['no ball, non-striker out',              { outSlot: END.NONSTRIKER },                        { survivorSlot: END.STRIKER, wicketToBowler: false }],
    ['no ball + short run docked',            { runsCompleted: 3, shortRuns: 1 },                 { teamRuns: 3, batRuns: 2, runsCompleted: 2 }],
  ];
  test.each(cases)('%s', (_name, input, expected) => {
    check(run({ delivery: DELIVERY.NOBALL, ...input }), expected);
  });

  // Law 38.3 — the non-striker run out backing up, before the ball is released.
  const mankad = [
    ['no delivery: nothing is bowled',    {}, { countsAsBall: false, ballFaced: 0, teamRuns: 0, chargedToBowler: 0, extraType: 'deadBall', chip: 'W' }],
    ['no delivery: over does not move',   { ballsInOverBefore: 3 }, { ballsInOverAfter: 3, overComplete: false }],
    ['no delivery: free hit unchanged',   { freeHit: true }, { freeHitNext: true }],
    ['no delivery: new batter at bowler\'s end', {}, { newBatterEnd: END.NONSTRIKER, nextStrikerIs: 'survivor' }],
    ['no delivery: striker keeps strike', {}, { survivorSlot: END.STRIKER, survivorAtStrikerEnd: true }],
  ];
  test.each(mankad)('%s', (_name, input, expected) => {
    check(run({ delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER, ...input }), expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — LEGAL DELIVERY + RUN OUT (Laws 18.11, 23, 38)
// ─────────────────────────────────────────────────────────────────────────────
describe('Legal delivery + run out', () => {
  const cases = [
    ['no run, striker out',            { runsCompleted: 0 },                            { teamRuns: 0, batRuns: 0, extras: 0, extraType: null, chip: 'W', countsAsBall: true, ballFaced: 1 }],
    ['1 completed off the bat',        { runsCompleted: 1 },                            { teamRuns: 1, batRuns: 1, chip: '1+W', chargedToBowler: 1 }],
    ['2 completed off the bat',        { runsCompleted: 2 },                            { teamRuns: 2, batRuns: 2, chip: '2+W' }],
    ['3 completed off the bat',        { runsCompleted: 3 },                            { teamRuns: 3, batRuns: 3, chip: '3+W' }],
    ['4 run out (overthrows)',         { runsCompleted: 4 },                            { teamRuns: 4, batRuns: 4, chip: '4+W' }],
    ['1 bye then run out',             { runsCompleted: 1, runsType: RUNS.BYE },        { teamRuns: 1, batRuns: 0, extras: 1, extraType: 'bye', chip: 'B+W', chargedToBowler: 0 }],
    ['2 byes then run out',            { runsCompleted: 2, runsType: RUNS.BYE },        { teamRuns: 2, extras: 2, chip: '2b+W', chargedToBowler: 0 }],
    ['1 leg bye then run out',         { runsCompleted: 1, runsType: RUNS.LEGBYE },     { teamRuns: 1, extras: 1, extraType: 'legBye', chip: 'LB+W', chargedToBowler: 0 }],
    ['3 leg byes then run out',        { runsCompleted: 3, runsType: RUNS.LEGBYE },     { teamRuns: 3, extras: 3, chip: '3lb+W' }],
    ['bat runs are charged to bowler', { runsCompleted: 2 },                            { chargedToBowler: 2 }],
    ['byes are not charged to bowler', { runsCompleted: 2, runsType: RUNS.BYE },        { chargedToBowler: 0 }],
    ['counts as one of the six',       { ballsInOverBefore: 2 },                        { countsAsBall: true, ballsInOverAfter: 3, overComplete: false }],
    ['last ball of the over',          { ballsInOverBefore: 5 },                        { ballsInOverAfter: 6, overComplete: true }],
    ['consumes a free hit',            { freeHit: true },                               { freeHitNext: false }],
    ['run in progress never scores',   { runsCompleted: 2 },                            { runInProgressScored: false, runsCompleted: 2 }],
    ['short run docked from the bat',  { runsCompleted: 3, shortRuns: 1 },              { teamRuns: 2, batRuns: 2 }],
  ];
  test.each(cases)('%s', (_name, input, expected) => {
    check(run({ delivery: DELIVERY.LEGAL, ...input }), expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — THE CREASE (Law 18.12)
// The incoming batter takes the end the wicket fell at; the not-out batter is at
// the other end; the end of an over swaps who is facing, not who stands where.
// ─────────────────────────────────────────────────────────────────────────────
describe('Ends and strike', () => {
  const matrix = [
    // out,             dismissal end,     over ends, survivor at striker's end, next striker
    [END.STRIKER,       END.STRIKER,       false, false, 'new'],
    [END.STRIKER,       END.NONSTRIKER,    false, true,  'survivor'],
    [END.NONSTRIKER,    END.STRIKER,       false, false, 'new'],
    [END.NONSTRIKER,    END.NONSTRIKER,    false, true,  'survivor'],
    [END.STRIKER,       END.STRIKER,       true,  false, 'survivor'],
    [END.STRIKER,       END.NONSTRIKER,    true,  true,  'new'],
    [END.NONSTRIKER,    END.STRIKER,       true,  false, 'survivor'],
    [END.NONSTRIKER,    END.NONSTRIKER,    true,  true,  'new'],
  ];
  test.each(matrix)('%s out at the %s end (over ends: %s)', (outSlot, dismissalEnd, overComplete, atStriker, next) => {
    const e = resolveEnds({ outSlot, dismissalEnd, overComplete });
    expect(e.survivorAtStrikerEnd).toBe(atStriker);
    expect(e.newBatterAtStrikerEnd).toBe(!atStriker);
    expect(e.nextStrikerIs).toBe(next);
    expect(e.survivorSlot).toBe(outSlot === END.STRIKER ? END.NONSTRIKER : END.STRIKER);
  });

  // The completed runs decide the score, never the crease — the end of dismissal
  // already accounts for every crossing.
  test.each([0, 1, 2, 3, 4])('%i completed runs do not move the crease', (runsCompleted) => {
    const a = run({ runsCompleted, dismissalEnd: END.STRIKER });
    const b = run({ runsCompleted: 0, dismissalEnd: END.STRIKER });
    expect(a.newBatterEnd).toBe(b.newBatterEnd);
    expect(a.survivorAtStrikerEnd).toBe(b.survivorAtStrikerEnd);
  });

  test('an over completed by the run out defers the change of ends', () => {
    const out = run({ ballsInOverBefore: 5, outSlot: END.STRIKER, dismissalEnd: END.NONSTRIKER });
    expect(out.overComplete).toBe(true);
    // Survivor is at the striker's end, but the over has ended → the incoming
    // batter, walking in at the bowler's end, is the one who faces.
    expect(out.survivorAtStrikerEnd).toBe(true);
    expect(out.nextStrikerIs).toBe('new');
  });

  test('a wide on the last ball of the over does not end it', () => {
    const out = run({ delivery: DELIVERY.WIDE, ballsInOverBefore: 5 });
    expect(out.overComplete).toBe(false);
    expect(out.nextStrikerIs).toBe('new');   // dismissal at the striker's end
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Validation', () => {
  const bad = [
    ['negative runs',                  { runsCompleted: -1 }],
    ['more than 6 run',                { runsCompleted: 7 }],
    ['unknown delivery',               { delivery: 'bouncer' }],
    ['unknown batter',                 { outSlot: 'keeper' }],
    ['unknown end',                    { dismissalEnd: 'deep midwicket' }],
    ['short runs exceed runs run',     { runsCompleted: 1, shortRuns: 2 }],
    ['runs before the ball is bowled', { delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER, runsCompleted: 1 }],
    ['striker out before delivery',    { delivery: DELIVERY.NONE, outSlot: END.STRIKER, dismissalEnd: END.NONSTRIKER }],
    ['pre-delivery wicket at the wrong end', { delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.STRIKER }],
  ];
  test.each(bad)('rejects: %s', (_name, input) => {
    const out = run(input);
    expect(out.valid).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  const good = [
    ['plain run out',              {}],
    ['wide + run out',             { delivery: DELIVERY.WIDE, runsCompleted: 1 }],
    ['no ball + run out',          { delivery: DELIVERY.NOBALL, runsCompleted: 2 }],
    ['byes + run out',             { runsType: RUNS.BYE, runsCompleted: 2 }],
    ['6 run then run out',         { runsCompleted: 6 }],
    ['non-striker out backing up', { delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER }],
  ];
  test.each(good)('accepts: %s', (_name, input) => {
    expect(run(input).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — NOTATION
// Every chip must end in 'W' when a wicket fell (the over strip counts and
// colours off that) and must carry the delivery's own runs.
// ─────────────────────────────────────────────────────────────────────────────
describe('Over-strip notation', () => {
  const chips = [
    [{ extraType: null, batRuns: 0, isWicket: true },                  'W'],
    [{ extraType: null, batRuns: 1, isWicket: true },                  '1+W'],
    [{ extraType: null, batRuns: 4, isWicket: true },                  '4+W'],
    [{ extraType: null, batRuns: 0, isWicket: false },                 '·'],
    [{ extraType: null, batRuns: 4, isWicket: false },                 '4'],
    [{ extraType: 'wide', extras: 1, isWicket: true },                 'WD+W'],
    [{ extraType: 'wide', extras: 3, isWicket: true },                 '3wd+W'],
    [{ extraType: 'wide', extras: 1, isWicket: false },                'WD'],
    [{ extraType: 'wide', extras: 2, isWicket: false },                '2wd'],
    [{ extraType: 'noBall', extras: 1, batRuns: 0, isWicket: true },   'NB+W'],
    [{ extraType: 'noBall', extras: 1, batRuns: 2, isWicket: true },   '3nb+W'],
    [{ extraType: 'noBall', extras: 3, batRuns: 0, isWicket: true },   '3nb+W'],
    [{ extraType: 'noBall', extras: 1, batRuns: 0, isWicket: false },  'NB'],
    [{ extraType: 'bye', extras: 1, isWicket: true },                  'B+W'],
    [{ extraType: 'bye', extras: 2, isWicket: true },                  '2b+W'],
    [{ extraType: 'legBye', extras: 1, isWicket: true },               'LB+W'],
    [{ extraType: 'legBye', extras: 3, isWicket: true },               '3lb+W'],
    [{ extraType: 'deadBall', isWicket: true },                        'W'],
    [{ extraType: 'penalty', extras: 5, isWicket: false },             'P5'],
  ];
  test.each(chips)('%o → %s', (input, expected) => {
    expect(ballChip(input)).toBe(expected);
  });

  // The over strip is the only live record of an over in progress, and the
  // "THIS OVER · N runs" tally is parsed straight back off it — so what ballChip
  // writes, chipRuns must read as the same number of runs.
  test('every run-out chip reads back at its own run value', () => {
    [DELIVERY.LEGAL, DELIVERY.WIDE, DELIVERY.NOBALL].forEach((delivery) => {
      [0, 1, 2, 3, 4].forEach((runsCompleted) => {
        [RUNS.BAT, RUNS.BYE, RUNS.LEGBYE].forEach((runsType) => {
          const o = resolveRunOut({ delivery, runsCompleted, runsType });
          expect(chipRuns(o.chip)).toBe(o.teamRuns);
        });
      });
    });
  });

  test('plain deliveries still read back correctly', () => {
    const strip = ['·', '4', 'WD', '2wd', 'NB', '3nb', 'B', '2b', 'LB', '3lb', 'P5', 'W'];
    expect(strip.map(chipRuns)).toEqual([0, 4, 1, 2, 1, 3, 1, 2, 1, 3, 5, 0]);
  });

  test('an over of mixed chips totals correctly', () => {
    // 4 + wide + 1 + no-ball-with-2 + run out off 1 + dot = 4+1+1+3+1+0
    expect(overRuns(['4', 'WD', '1', '3nb', '1+W', '·'])).toBe(10);
  });

  test('only wicket chips are flagged as wickets', () => {
    ['W', '1+W', 'WD+W', '3wd+W', 'NB+W', 'B+W', '2lb+W'].forEach((c) => expect(isWicketChip(c)).toBe(true));
    ['·', '4', 'WD', '2wd', 'NB', '3nb', 'B', '2b', 'LB', 'P5'].forEach((c) => expect(isWicketChip(c)).toBe(false));
  });

  test('every run-out chip ends in W', () => {
    [DELIVERY.LEGAL, DELIVERY.WIDE, DELIVERY.NOBALL].forEach((delivery) => {
      [0, 1, 2, 3].forEach((runsCompleted) => {
        [RUNS.BAT, RUNS.BYE, RUNS.LEGBYE].forEach((runsType) => {
          expect(run({ delivery, runsCompleted, runsType }).chip.endsWith('W')).toBe(true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — COMMENTARY
// ─────────────────────────────────────────────────────────────────────────────
describe('Commentary', () => {
  const names = { strikerName: 'Rohit', nonStrikerName: 'Gill', bowlerName: 'Starc', fielderName: 'Maxwell' };
  const lines = [
    [{ delivery: DELIVERY.LEGAL, runsCompleted: 1 },                          /1 run then OUT — Rohit run out \(Maxwell\)/],
    [{ delivery: DELIVERY.LEGAL, runsCompleted: 0 },                          /no run then OUT/],
    [{ delivery: DELIVERY.WIDE, runsCompleted: 1 },                           /^Wide, 1 run then OUT/],
    [{ delivery: DELIVERY.NOBALL, runsCompleted: 2 },                         /^No ball, 2 runs then OUT/],
    [{ delivery: DELIVERY.LEGAL, runsCompleted: 2, runsType: RUNS.BYE },      /^Byes, 2 runs then OUT/],
    [{ delivery: DELIVERY.LEGAL, runsCompleted: 1, runsType: RUNS.LEGBYE },   /^Leg byes, 1 run then OUT/],
    [{ delivery: DELIVERY.LEGAL, runsCompleted: 0, outSlot: END.NONSTRIKER }, /OUT — Gill run out/],
  ];
  test.each(lines)('%o', (input, pattern) => {
    expect(runOutCommentary(run(input), names)).toMatch(pattern);
  });

  test('run out before delivery names the bowler', () => {
    const out = run({ delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER });
    expect(runOutCommentary(out, names)).toMatch(/Starc runs out Gill backing up/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — FULL MATCH SITUATIONS
// End-to-end rows in the shape a scorer would read them: the situation, the
// delivery, and the book entry that must come out.
// ─────────────────────────────────────────────────────────────────────────────
describe('Match situations', () => {
  const situations = [
    {
      name: '19.5, 2 to win, batters go for the second, striker short at the bowler\'s end',
      input: { delivery: DELIVERY.LEGAL, runsCompleted: 1, outSlot: END.STRIKER, dismissalEnd: END.NONSTRIKER, ballsInOverBefore: 4 },
      expect: { teamRuns: 1, countsAsBall: true, ballsInOverAfter: 5, overComplete: false, nextStrikerIs: 'survivor', chip: '1+W' },
    },
    {
      name: 'wide down leg, keeper misses, batters steal one, non-striker beaten coming back',
      input: { delivery: DELIVERY.WIDE, runsCompleted: 1, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER },
      expect: { teamRuns: 2, extras: 2, countsAsBall: false, chip: '2wd+W', newBatterEnd: END.NONSTRIKER, nextStrikerIs: 'survivor' },
    },
    {
      name: 'free hit no ball, batters run one, striker run out going back for two',
      input: { delivery: DELIVERY.NOBALL, runsCompleted: 1, freeHit: true, outSlot: END.STRIKER, dismissalEnd: END.STRIKER },
      expect: { teamRuns: 2, batRuns: 1, extras: 1, freeHitNext: true, countsAsBall: false, nextStrikerIs: 'new' },
    },
    {
      name: 'last ball of the over, byes taken, non-striker run out at the striker\'s end',
      input: { delivery: DELIVERY.LEGAL, runsCompleted: 1, runsType: RUNS.BYE, ballsInOverBefore: 5, outSlot: END.NONSTRIKER, dismissalEnd: END.STRIKER },
      expect: { teamRuns: 1, extras: 1, extraType: 'bye', overComplete: true, nextStrikerIs: 'survivor', chargedToBowler: 0 },
    },
    {
      name: 'bowler removes the bails with the non-striker out of his ground',
      input: { delivery: DELIVERY.NONE, outSlot: END.NONSTRIKER, dismissalEnd: END.NONSTRIKER, ballsInOverBefore: 2 },
      expect: { teamRuns: 0, countsAsBall: false, ballsInOverAfter: 2, chargedToBowler: 0, chip: 'W' },
    },
    {
      name: 'throw to the keeper, striker turned back and beaten, no run',
      input: { delivery: DELIVERY.LEGAL, runsCompleted: 0, outSlot: END.STRIKER, dismissalEnd: END.STRIKER },
      expect: { teamRuns: 0, chip: 'W', newBatterEnd: END.STRIKER, nextStrikerIs: 'new' },
    },
    {
      name: 'three run, direct hit at the bowler\'s end on the fourth',
      input: { delivery: DELIVERY.LEGAL, runsCompleted: 3, outSlot: END.STRIKER, dismissalEnd: END.NONSTRIKER },
      expect: { teamRuns: 3, batRuns: 3, chip: '3+W', nextStrikerIs: 'survivor' },
    },
    {
      name: 'wide, four overthrows RUN (not a boundary), then run out',
      input: { delivery: DELIVERY.WIDE, runsCompleted: 4 },
      expect: { teamRuns: 5, extras: 5, chip: '5wd+W' },
    },
    {
      name: 'no ball, two leg byes, run out attempting the third',
      input: { delivery: DELIVERY.NOBALL, runsCompleted: 2, runsType: RUNS.LEGBYE },
      expect: { teamRuns: 3, batRuns: 0, extras: 3, extraType: 'noBall', chargedToBowler: 3 },
    },
    {
      name: 'short run given, then run out on the next run',
      input: { delivery: DELIVERY.LEGAL, runsCompleted: 2, shortRuns: 1 },
      expect: { teamRuns: 1, batRuns: 1, runsCompleted: 1 },
    },
  ];
  situations.forEach((s) => test(s.name, () => check(run(s.input), s.expect)));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — INVARIANTS ACROSS THE WHOLE INPUT SPACE
// Swept over every combination, so a change to one branch can't quietly break a
// Law somewhere else.
// ─────────────────────────────────────────────────────────────────────────────
describe('Invariants over every combination', () => {
  const all = [];
  [DELIVERY.LEGAL, DELIVERY.WIDE, DELIVERY.NOBALL].forEach((delivery) => {
    [0, 1, 2, 3, 4].forEach((runsCompleted) => {
      [RUNS.BAT, RUNS.BYE, RUNS.LEGBYE].forEach((runsType) => {
        [END.STRIKER, END.NONSTRIKER].forEach((outSlot) => {
          [END.STRIKER, END.NONSTRIKER].forEach((dismissalEnd) => {
            [0, 5].forEach((ballsInOverBefore) => {
              all.push({ delivery, runsCompleted, runsType, outSlot, dismissalEnd, ballsInOverBefore });
            });
          });
        });
      });
    });
  });

  test(`sweep covers ${all.length} combinations`, () => {
    expect(all.length).toBe(3 * 5 * 3 * 2 * 2 * 2);
  });

  test('a run out is never credited to the bowler (Law 38.2)', () => {
    all.forEach((i) => expect(run(i).wicketToBowler).toBe(false));
  });

  test('team runs always equal bat runs plus extras', () => {
    all.forEach((i) => { const o = run(i); expect(o.teamRuns).toBe(o.batRuns + o.extras); });
  });

  test('only a legal delivery counts toward the over (Laws 21.18, 22.7)', () => {
    all.forEach((i) => expect(run(i).countsAsBall).toBe(i.delivery === DELIVERY.LEGAL));
  });

  test('a wide is never a ball faced, a no ball always is (Law 22)', () => {
    all.forEach((i) => expect(run(i).ballFaced).toBe(i.delivery === DELIVERY.WIDE ? 0 : 1));
  });

  test('nothing off a wide is ever credited to the bat (Law 22.4)', () => {
    all.filter((i) => i.delivery === DELIVERY.WIDE).forEach((i) => expect(run(i).batRuns).toBe(0));
  });

  test('the wide and no ball penalties are always charged to the bowler', () => {
    all.filter((i) => i.delivery !== DELIVERY.LEGAL)
      .forEach((i) => expect(run(i).chargedToBowler).toBe(1 + i.runsCompleted));
  });

  test('byes and leg byes off a legal ball are never charged to the bowler (Law 23)', () => {
    all.filter((i) => i.delivery === DELIVERY.LEGAL && i.runsType !== RUNS.BAT)
      .forEach((i) => expect(run(i).chargedToBowler).toBe(0));
  });

  test('the incoming batter always takes the end the wicket fell at (Law 18.12)', () => {
    all.forEach((i) => {
      const o = run(i);
      expect(o.newBatterEnd).toBe(i.dismissalEnd);
      expect(o.survivorAtStrikerEnd).toBe(i.dismissalEnd === END.NONSTRIKER);
    });
  });

  test('the survivor is always the other batter', () => {
    all.forEach((i) => {
      const o = run(i);
      expect(o.survivorSlot).toBe(i.outSlot === END.STRIKER ? END.NONSTRIKER : END.STRIKER);
    });
  });

  test('a free hit survives everything except a legal delivery', () => {
    all.forEach((i) => {
      const o = run({ ...i, freeHit: true });
      expect(o.freeHitNext).toBe(i.delivery !== DELIVERY.LEGAL);
    });
  });

  test('only a legal sixth ball completes the over', () => {
    all.filter((i) => i.ballsInOverBefore === 5)
      .forEach((i) => expect(run(i).overComplete).toBe(i.delivery === DELIVERY.LEGAL));
  });

  test('the run in progress is never scored (Law 18.11)', () => {
    all.forEach((i) => expect(run(i).runInProgressScored).toBe(false));
  });
});
