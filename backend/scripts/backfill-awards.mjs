// backfill-awards.mjs — file the honours for matches that finished before the
// awards ledger existed.
//
// Match awards are written when a match completes, and lazily when someone opens
// GET /matches/:id/awards. That second path was meant to fill in the history on
// its own, but it means a career shows no honours until every old scorecard has
// been opened by somebody — so the cabinet reads empty for everyone on day one.
// This does the whole history in one pass.
//
// Idempotent: persistMatchAwards() replaces a match's rows, so re-running after
// a rescore corrects the honours rather than duplicating them.
//
//   node scripts/backfill-awards.mjs           # only matches with nothing filed
//   node scripts/backfill-awards.mjs --force   # recompute every completed match

import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { computeAwards } from '../src/lib/mvp.js';
import { persistMatchAwards, persistSeriesAwards } from '../src/lib/awards.js';

// The same include the live award path uses (routes/matches.js): both squads
// plus the full ball-by-ball log, with the per-delivery bowler.
const loadMatchForAwards = (id) => prisma.match.findUnique({
  where: { id },
  include: {
    team1: true,
    team2: true,
    squads: { include: { player: { select: { name: true } } } },
    innings: {
      orderBy: { inningNumber: 'asc' },
      include: {
        battingTeam: { select: { name: true } },
        bowlingTeam: { select: { name: true } },
        oversData: {
          orderBy: { overNumber: 'asc' },
          include: {
            bowler: { select: { name: true } },
            balls: {
              orderBy: { ballNumber: 'asc' },
              include: { batter: { select: { name: true } }, bowler: { select: { name: true } } },
            },
          },
        },
      },
    },
  },
});

const force = process.argv.includes('--force');

const done = await prisma.matchAward.groupBy({ by: ['matchId'] });
const alreadyFiled = new Set(done.map((d) => d.matchId));

const matches = await prisma.match.findMany({
  where: { status: 'completed' },
  select: { id: true, sport: true, result: true, startTime: true },
  orderBy: { startTime: 'asc' },
});

console.log(`${matches.length} completed matches; ${alreadyFiled.size} already filed${force ? ' (--force: redoing all)' : ''}\n`);

let filed = 0, skipped = 0, empty = 0;
for (const m of matches) {
  if (!force && alreadyFiled.has(m.id)) { skipped += 1; continue; }
  const full = await loadMatchForAwards(m.id);
  if (!full) { skipped += 1; continue; }
  const awards = computeAwards(full);
  const n = await persistMatchAwards(full, awards);
  if (!n) {
    // No ball-by-ball data — a non-cricket fixture, or a result typed straight
    // in. There are no honours to file, and persistMatchAwards says so.
    empty += 1;
    console.log(`  ·  ${m.id}  ${(m.sport || '?').padEnd(8)} no scoring data`);
    continue;
  }
  filed += 1;
  const who = [['motm', 'manOfMatch'], ['fighter', 'fighter'], ['batter', 'bestBatter'],
               ['bowler', 'bestBowler'], ['fielder', 'bestFielder']]
    .filter(([, f]) => awards[f]?.playerId)
    .map(([k, f]) => `${k}=${awards[f].name}`)
    .join(', ');
  console.log(`  ✓  ${m.id}  ${who}`);
}

console.log(`\nmatches filed: ${filed} · no data: ${empty} · skipped: ${skipped}`);

// Series honours follow from the match ledger, so they can only be worked out
// once the above has run.
const tournaments = await prisma.tournament.findMany({ select: { id: true, name: true } });
let crowned = 0;
for (const t of tournaments) {
  const n = await persistSeriesAwards(t.id).catch((e) => { console.error(`  ! ${t.name}: ${e.message}`); return 0; });
  if (n) {
    crowned += 1;
    const [pots] = await prisma.tournamentAward.findMany({ where: { tournamentId: t.id, kind: 'series' } });
    console.log(`  🏆 ${t.name}: ${n} honours${pots ? ` · Player of the Series ${pots.playerName}` : ''}`);
  }
}
console.log(`tournaments with honours: ${crowned}/${tournaments.length}`);

await prisma.$disconnect();
