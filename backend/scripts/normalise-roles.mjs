#!/usr/bin/env node
// Fold the many spellings of a cricket role into the four the app offers.
//
//   node scripts/normalise-roles.mjs           # dry run — prints the plan
//   node scripts/normalise-roles.mjs --apply   # write it
//
// WRITES TO NEON when applied. There is no local database (CLAUDE.md), so this
// is a production migration; the dry run is the default for that reason.
//
// Why: Player.role is free text typed by whoever added the player, and this
// database holds eight spellings of five cricket roles — Bat, Batsman, Bowl,
// Bowler, All Rounder, allrounder, Wicket Keeper, Player. The squad comparator
// (lib/squadOrder.js) reads all of them, so nothing is broken; but the role is
// also DISPLAYED under every player's name, and a squad reading "Bat, Bat,
// Bowl, Batsman" looks like a bug even though it sorts correctly.
//
// The four canonical names come from the sports registry the app already
// offers in Find Players and the squad manage sheet, via canonicalRole().
//
// TWO THINGS IT DELIBERATELY WILL NOT DO:
//   · It never touches a non-cricket player. "Defender" is right for football
//     and this has no business renaming it.
//   · It never guesses. "Player" and blank say nothing about how someone
//     plays, and inventing a role from a handful of matches would put a word
//     under their name that nobody chose. Those are listed and left alone —
//     the fix for them is a human setting a role, which is now possible for
//     every sport rather than only cricket.

import { PrismaClient } from '@prisma/client';
import { canonicalRole } from '../src/lib/squadOrder.js';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const players = await prisma.player.findMany({
  where: { sport: 'cricket' },
  select: { id: true, name: true, role: true, sport: true },
});

const changes = [];
const untouched = {};
for (const p of players) {
  const want = canonicalRole(p.role, p.sport);
  if (!want) { (untouched[p.role || '(blank)'] ||= []).push(p.name); continue; }
  if (want !== p.role) changes.push({ id: p.id, name: p.name, from: p.role, to: want });
}

const byMove = {};
for (const c of changes) (byMove[`${c.from || '(blank)'} → ${c.to}`] ||= []).push(c.name);

console.log(`cricket players: ${players.length}`);
console.log(`\nwould change ${changes.length}:`);
for (const [move, names] of Object.entries(byMove).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(names.length).padStart(3)} × ${move}`);
}
const leftCount = Object.values(untouched).reduce((n, a) => n + a.length, 0);
console.log(`\nleft alone (${leftCount}) — these say nothing about how someone plays:`);
for (const [role, names] of Object.entries(untouched).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(names.length).padStart(3)} × ${role}`);
}

if (!APPLY) {
  console.log('\nDry run. Nothing written. Re-run with --apply to make these changes.');
} else if (!changes.length) {
  console.log('\nNothing to do.');
} else {
  // Grouped by target so this is a handful of updateMany calls, not 200 writes.
  const byTarget = {};
  for (const c of changes) (byTarget[c.to] ||= []).push(c.id);
  let n = 0;
  for (const [to, ids] of Object.entries(byTarget)) {
    const r = await prisma.player.updateMany({ where: { id: { in: ids } }, data: { role: to } });
    n += r.count;
    console.log(`  set ${r.count} → ${to}`);
  }
  console.log(`\n✓ ${n} players updated.`);
}

await prisma.$disconnect();
