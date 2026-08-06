#!/usr/bin/env node
// Recompute oversFaced/oversBowled on every tournament fixture that was
// finished through the app, from the deliveries.
//
// Inning.totalOvers is 0 on every row, so deriveResultFromMatch stored zero
// overs for every such fixture. Runs were always right; overs and therefore net
// run rate were not. WRITES TO NEON — there is no local database.
//
//   node backfill-overs.mjs --dry     (default: show only)
//   node backfill-overs.mjs --apply
import { prisma } from '../src/lib/prisma.js';
import { deriveResultFromMatch } from '../src/lib/tournamentResult.js';

const apply = process.argv.includes('--apply');
const fixtures = await prisma.tournamentMatch.findMany({
  where: { matchId: { not: null }, status: 'completed' },
  select: { id: true, matchId: true, resultStats: true, tournament: { select: { name: true } } },
});
console.log(`${fixtures.length} completed fixture(s) with a real match\n`);
let changed = 0;
for (const f of fixtures) {
  const match = await prisma.match.findUnique({ where: { id: f.matchId }, select: { id: true, team1Id: true, team2Id: true } });
  if (!match) continue;
  const derived = await deriveResultFromMatch(match);
  if (!derived) { console.log(`  ${f.id}  no scorable innings — skipped`); continue; }
  const before = f.resultStats || {};
  const stale = Object.values(before).some((s) => !s?.ballsFaced);
  console.log(`  ${f.tournament?.name || '?'} · ${f.id}`);
  for (const [tid, s] of Object.entries(derived.stats)) {
    console.log(`     ${tid}  ${before[tid]?.scored ?? '?'}/${before[tid]?.oversFaced ?? '?'} ov  →  ${s.scored}/${s.oversFaced} ov (${s.ballsFaced} balls)`);
  }
  if (!stale) { console.log('     already has ball counts — skipped'); continue; }
  changed++;
  if (apply) await prisma.tournamentMatch.update({ where: { id: f.id }, data: { resultStats: derived.stats } });
}
console.log(`\n${changed} fixture(s) ${apply ? 'UPDATED' : 'would change — re-run with --apply'}`);
await prisma.$disconnect();
