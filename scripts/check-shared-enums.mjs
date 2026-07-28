#!/usr/bin/env node
// Catches value lists that the frontend and backend each declare separately and
// have to agree on. There's no shared package — they're two npm projects — so
// nothing else stops one side quietly drifting from the other.
//
// This exists because the Scout create form offered ten listing types while the
// server's zod enum accepted seven. Posting a ground, tournament or teamtourn
// listing 400'd every time, so three categories were unusable and the filter
// chips for them sat permanently at zero. Nothing failed loudly; it just didn't
// work.
//
//   node scripts/check-shared-enums.mjs
//
// Exits non-zero on drift, so it can gate a commit or a deploy.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const listFrom = (src, re, label) => {
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${label} — has it been renamed or reformatted?`);
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
};

const CHECKS = [
  {
    name: 'Scout listing types',
    a: {
      label: 'TYPES in LookingForScreen.js',
      get: () => listFrom(
        read('frontend/src/screens/LookingForScreen.js'),
        /const TYPES = \[([\s\S]*?)\];/,
        'TYPES in LookingForScreen.js',
      ),
    },
    b: {
      label: "z.enum in looking-for.js",
      get: () => listFrom(
        read('backend/src/routes/looking-for.js'),
        /type:\s*z\.enum\(\[([\s\S]*?)\]\)/,
        'the type z.enum in looking-for.js',
      ),
    },
  },
];

let failed = false;
for (const check of CHECKS) {
  let a, b;
  try {
    a = check.a.get();
    b = check.b.get();
  } catch (e) {
    console.error(`✗ ${check.name}: ${e.message}`);
    failed = true;
    continue;
  }
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (onlyA.length || onlyB.length) {
    failed = true;
    console.error(`✗ ${check.name} disagree:`);
    if (onlyA.length) console.error(`    only in ${check.a.label}: ${onlyA.join(', ')}`);
    if (onlyB.length) console.error(`    only in ${check.b.label}: ${onlyB.join(', ')}`);
  } else {
    console.log(`✓ ${check.name} — ${a.length} values, both sides agree`);
  }
}

process.exit(failed ? 1 : 0);
