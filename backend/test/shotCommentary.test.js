// Commentary must never contradict the wagon wheel.
//
// This is the property worth a test rather than an eyeball: the templates are
// grouped by STROKE, and the tempting way to write them is to let the cover
// drive's line say "through the covers" — which is right almost always and
// wrong exactly when a scorer records something interesting. A cover drive
// that went to long off is a real delivery, and the line has to follow the
// ball rather than the stroke's usual habit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { commentaryFor } from '../src/lib/shotCommentary.js';
import { SHOT_TYPES, SHOT_ZONES, sideOfZone, shotLabel } from '../src/lib/ballIntelligence.js';

const ball = (o) => ({ id: 'b1', ballNumber: 1, runs: 0, extras: 0, ...o });
const names = { batter: 'Virat Kohli', bowler: 'R Anand' };

// Region words that would be a lie if the ball went to the other side.
const OFF_WORDS = /\b(cover|covers|point|third man|off side|extra cover|mid off|long off)\b/i;
const LEG_WORDS = /\b(mid wicket|midwicket|square leg|fine leg|long on|mid on|leg side)\b/i;

test('no line names a region on the wrong side of the wicket', () => {
  const bad = [];
  for (const t of SHOT_TYPES) {
    for (const z of SHOT_ZONES) {
      for (const runs of [0, 1, 2, 4, 6]) {
        for (let i = 0; i < 6; i++) {
          const line = commentaryFor(
            ball({ id: `s${i}`, runs }),
            { shotType: t.key, shotZone: z.key, lofted: runs === 6 },
            names,
          );
          if (!line) continue;
          // The stroke's own NAME is not a location claim. "Cover drive" played
          // to fine leg is a leading edge — a real delivery a scorer must be
          // able to record — and the line is correct as long as the region it
          // names is the one the ball actually went to. So the label comes out
          // before the scan, or this test would just be asserting that strokes
          // are never played anywhere unusual.
          const scan = line.replace(new RegExp(shotLabel(t.key), 'ig'), '');
          const side = sideOfZone(z.key);
          if (side === 'off' && LEG_WORDS.test(scan)) bad.push([t.key, z.key, runs, line]);
          if (side === 'leg' && OFF_WORDS.test(scan)) bad.push([t.key, z.key, runs, line]);
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `contradictions: ${bad.length}`);
});

test('extras never get batter-shot commentary', () => {
  for (const extraType of ['wide', 'bye', 'legBye']) {
    const line = commentaryFor(ball({ extraType, extras: 1 }), null, names);
    assert.ok(line, `${extraType} should still say something`);
    assert.ok(!/drive|pull|cut|sweep|flick/i.test(line), `${extraType} named a stroke: ${line}`);
  }
});

test('the same event does not always produce the same sentence', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    seen.add(commentaryFor(ball({ id: `v${i}`, runs: 4 }),
      { shotType: 'coverDrive', shotZone: 'cover' }, names));
  }
  assert.ok(seen.size >= 3, `only ${seen.size} distinct lines`);
});

test('a delivery with no captured shot still reads correctly', () => {
  assert.match(commentaryFor(ball({ runs: 4 }), null, names), /[Ff]our/);
  assert.match(commentaryFor(ball({ runs: 6 }), null, names), /[Ss]ix/);
});

test('an initial is not mistaken for a surname', () => {
  const line = commentaryFor(ball({ runs: 1 }), { shotType: 'coverDrive', shotZone: 'cover' },
    { batter: 'Kannan K', bowler: 'R Anand' });
  assert.ok(!/\bK\b/.test(line), `used the initial: ${line}`);
});
