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
