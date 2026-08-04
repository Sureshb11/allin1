// The squad a toss submits: who plays, who leads, who keeps.
//
// Worth pinning because the failure mode is silent. A designation that doesn't
// stick shows up as a scorecard with no (C) on it, which looks exactly like a
// scorer who didn't bother — and that is precisely the state this feature was
// built to get out of.
//
//   node --test test/          (or: npm test)

import test from 'node:test';
import assert from 'node:assert/strict';
import { SquadSchema, squadRows } from '../src/lib/matchSquad.js';

const XI = ['p1', 'p2', 'p3'];
const squad = (o = {}) => ({ teamId: 't1', playerIds: XI, ...o });
const rowFor = (rows, id) => rows.find((r) => r.playerId === id);

test('the three jobs land on the three players named, and on nobody else', () => {
  const rows = squadRows('m1', [squad({ captainId: 'p1', viceCaptainId: 'p2', keeperId: 'p3' })]);
  assert.equal(rows.length, 3);
  assert.equal(rowFor(rows, 'p1').isCaptain, true);
  assert.equal(rowFor(rows, 'p2').isViceCaptain, true);
  assert.equal(rowFor(rows, 'p3').isWk, true);
  // and each of them holds only their own job
  assert.equal(rowFor(rows, 'p1').isWk, false);
  assert.equal(rowFor(rows, 'p2').isCaptain, false);
  assert.equal(rowFor(rows, 'p3').isCaptain, false);
});

test('one player can captain and keep — that is a real team, not a mistake', () => {
  const rows = squadRows('m1', [squad({ captainId: 'p1', keeperId: 'p1' })]);
  assert.equal(rowFor(rows, 'p1').isCaptain, true);
  assert.equal(rowFor(rows, 'p1').isWk, true);
});

test('a scorer who says nothing still gets a squad', () => {
  const rows = squadRows('m1', [squad()]);
  assert.equal(rows.length, 3);
  // false, not undefined — these are non-null columns with a default, and a row
  // built without them would fail the insert.
  assert.deepEqual(
    rows.map((r) => [r.isCaptain, r.isViceCaptain, r.isWk]),
    [[false, false, false], [false, false, false], [false, false, false]],
  );
});

test('a designation outside the XI is refused, not quietly dropped', () => {
  // Silently ignoring it would produce a scorecard with no captain on it and
  // nothing anywhere to say why.
  assert.throws(
    () => squadRows('m1', [squad({ captainId: 'p9' })]),
    /captain must be one of the players selected/,
  );
  assert.throws(
    () => squadRows('m1', [squad({ keeperId: 'p9' })]),
    /wicketkeeper must be one of the players selected/,
  );
});

test('nobody is their own deputy', () => {
  assert.throws(
    () => squadRows('m1', [squad({ captainId: 'p1', viceCaptainId: 'p1' })]),
    /cannot be both captain and vice-captain/,
  );
});

test('both sides are built independently', () => {
  const rows = squadRows('m1', [
    squad({ captainId: 'p1' }),
    { teamId: 't2', playerIds: ['q1', 'q2'], captainId: 'q2', keeperId: 'q1' },
  ]);
  assert.equal(rows.length, 5);
  assert.equal(rowFor(rows, 'p1').isCaptain, true);
  assert.equal(rowFor(rows, 'q2').isCaptain, true);
  assert.equal(rowFor(rows, 'q1').isWk, true);
  assert.equal(rows.every((r) => r.matchId === 'm1'), true);
  // team stays with its own players — a captain can't be credited to the
  // opposition by a flatMap that loses track of which squad it is in
  assert.equal(rowFor(rows, 'p1').teamId, 't1');
  assert.equal(rowFor(rows, 'q1').teamId, 't2');
});

test('the payload the old clients send still parses', () => {
  // An app that predates this feature sends teamId + playerIds and nothing
  // else. It must keep working, or a stale phone can no longer start a match.
  const parsed = SquadSchema.parse({ teamId: 't1', playerIds: XI });
  assert.deepEqual(parsed, { teamId: 't1', playerIds: XI });
  assert.equal(squadRows('m1', [parsed]).length, 3);
});

test('null clears a job — it is not the same as omitting it', () => {
  // The app sends null when the scorer un-taps a mark.
  const parsed = SquadSchema.parse({ teamId: 't1', playerIds: XI, captainId: null, keeperId: null });
  const rows = squadRows('m1', [parsed]);
  assert.equal(rows.some((r) => r.isCaptain || r.isWk), false);
});
