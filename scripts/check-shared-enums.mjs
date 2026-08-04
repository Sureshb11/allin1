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

// Every .js under a directory, so a check can look at call sites rather than a
// declared list — the folder an upload asks for is an argument, not a constant.
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
};

// The executable part of a module — comments and blank lines stripped — so two
// files that behave identically compare equal even where their headers differ.
const ruleOf = (src) => src
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

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
  {
    // The second instance of the same bug. Create Tournament uploaded its logo
    // and banner to a `tournaments` folder that the upload route's allow-list
    // didn't have, so every one of those uploads 400'd — silently, because a
    // failed image upload just leaves the tile empty.
    name: 'Image upload folders',
    // Subset, not equality: the server may allow a folder nothing uses yet.
    // What must never happen is the app asking for one the server rejects.
    mode: 'subset',
    a: {
      label: 'folders the app uploads to',
      get: () => {
        const found = new Set();
        for (const f of walk('frontend/src')) {
          const src = read(f);
          for (const m of src.matchAll(/(?:pickAndUploadImage|captureAndUploadImage)\(\s*(?:'([^']*)')?/g)) {
            found.add(m[1] || 'feed');   // the helpers default to 'feed'
          }
          for (const m of src.matchAll(/uploadImage\(\{[^}]*folder:\s*'([^']*)'/g)) found.add(m[1]);
        }
        return [...found].sort();
      },
    },
    b: {
      label: 'FOLDERS in upload.js',
      get: () => listFrom(
        read('backend/src/routes/upload.js'),
        /const FOLDERS = new Set\(\[([\s\S]*?)\]\)/,
        'the FOLDERS set in upload.js',
      ),
    },
  },
  {
    // The squad order — captain, vice, keepers, batters, all-rounders, bowlers.
    // It has to be identical on both sides: the server sorts the team profile
    // with it and the app sorts every picker with it, so a difference means a
    // captain sitting third on one screen and seventh on the next.
    //
    // These two files are byte-identical apart from one comment line naming the
    // other, so the whole rule is compared rather than a list of values.
    name: 'Squad order rule',
    mode: 'identical',
    a: {
      label: 'frontend/src/utils/squadOrder.js',
      get: () => [ruleOf(read('frontend/src/utils/squadOrder.js'))],
    },
    b: {
      label: 'backend/src/lib/squadOrder.js',
      get: () => [ruleOf(read('backend/src/lib/squadOrder.js'))],
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
  // Two whole modules compared as one string: printing both sides is 2,400
  // characters of noise, so say WHERE they first diverge instead.
  if (check.mode === 'identical') {
    if (a[0] === b[0]) { console.log(`✓ ${check.name} — identical on both sides`); continue; }
    failed = true;
    let i = 0;
    while (i < a[0].length && a[0][i] === b[0][i]) i++;
    const near = (x) => x.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
    console.error(`✗ ${check.name} has drifted:`);
    console.error(`    ${check.a.label}: …${near(a[0])}…`);
    console.error(`    ${check.b.label}: …${near(b[0])}…`);
    continue;
  }
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  const subset = check.mode === 'subset';
  if (onlyA.length || (!subset && onlyB.length)) {
    failed = true;
    console.error(`✗ ${check.name} disagree:`);
    if (onlyA.length) console.error(`    only in ${check.a.label}: ${onlyA.join(', ')}`);
    if (onlyB.length && !subset) console.error(`    only in ${check.b.label}: ${onlyB.join(', ')}`);
  } else {
    const spare = subset && onlyB.length ? ` (${onlyB.length} allowed but unused)` : '';
    console.log(`✓ ${check.name} — ${a.length} values, both sides agree${spare}`);
  }
}

process.exit(failed ? 1 : 0);
