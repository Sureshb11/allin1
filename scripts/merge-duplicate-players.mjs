#!/usr/bin/env node
/**
 * Merge duplicate Player rows.
 *
 * Production has 30 duplicated names across 76 rows — including Rohit Sharma,
 * Shubman Gill and Virat Kohli each appearing twice on the SAME team. That
 * splits one person's batting and bowling across two ids, and it corrupts the
 * fielding tallies outright: catches and run-outs are matched back by NAME
 * (Ball.wicketAssists stores the fielder's name, not their id), so every
 * duplicate row receives the FULL tally. Ruturaj Gaikwad shows twice on the
 * leaderboard with "2 catches, 1 run-out" each — that's one player's record,
 * printed twice.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   node scripts/merge-duplicate-players.mjs                 # report only
 *   node scripts/merge-duplicate-players.mjs --sport=cricket # narrow it
 *   node scripts/merge-duplicate-players.mjs --apply         # actually merge
 *
 * Run it from backend/ so its .env is picked up — it uses the same Prisma client
 * the API does, so it points at whatever DATABASE_URL points at. That is
 * PRODUCTION if you are using the deployed .env. Read the dry run first.
 *
 * WHAT COUNTS AS A DUPLICATE: same trimmed name, same teamId, same sport. Two
 * players with the same name on DIFFERENT teams are left alone — they are far
 * more likely to be two different people, and merging them would be unrecoverable.
 *
 * WHICH ROW SURVIVES: the one linked to a user account wins (it is the one that
 * can own a profile and a photo); otherwise the one with the most match
 * appearances, then the oldest id as a stable tiebreak.
 */

// Imported from the backend rather than constructed here: @prisma/client lives
// in backend/node_modules, and ESM resolves from the importing FILE's location,
// not the working directory — so a bare '@prisma/client' from scripts/ can't be
// found however you invoke it.
import { prisma } from '../backend/src/lib/prisma.js';
const APPLY = process.argv.includes('--apply');
const sportArg = process.argv.find((a) => a.startsWith('--sport='));
const SPORT = sportArg ? sportArg.split('=')[1] : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function countsFor(id) {
  const [batted, nonStruck, bowledBalls, overs, apps, events, mvps, dismissed] = await Promise.all([
    prisma.ball.count({ where: { batterId: id } }),
    prisma.ball.count({ where: { nonStrikerId: id } }),
    prisma.ball.count({ where: { bowlerId: id } }),
    prisma.over.count({ where: { bowlerId: id } }),
    prisma.matchPlayer.count({ where: { playerId: id } }),
    prisma.sportEvent.count({ where: { playerId: id } }),
    prisma.matchMVP.count({ where: { playerId: id } }),
    prisma.ball.count({ where: { dismissedPlayerId: id } }),
  ]);
  return { batted, nonStruck, bowledBalls, overs, apps, events, mvps, dismissed,
           total: batted + nonStruck + bowledBalls + overs + apps + events + mvps + dismissed };
}

async function main() {
  const where = SPORT ? { sport: SPORT } : {};
  const players = await prisma.player.findMany({
    where,
    select: { id: true, name: true, teamId: true, sport: true, userId: true },
  });

  // Group on the identity that makes two rows the same person.
  const groups = new Map();
  for (const p of players) {
    if (!p.teamId) continue;          // teamless rows have no safe identity key
    const key = `${p.sport}::${p.teamId}::${(p.name || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1);

  console.log(`${players.length} players scanned${SPORT ? ` (sport=${SPORT})` : ''}`);
  console.log(`${dupes.length} duplicate groups, covering ${plural(dupes.reduce((n, g) => n + g.length, 0), 'row')}`);
  console.log(APPLY ? '\n*** APPLY MODE — changes WILL be written ***\n' : '\nDRY RUN — nothing will be written\n');

  let merged = 0;
  for (const group of dupes) {
    const enriched = await Promise.all(group.map(async (p) => ({ ...p, counts: await countsFor(p.id) })));
    // Linked account first, then the busiest row, then oldest id for stability.
    enriched.sort((a, b) =>
      (b.userId ? 1 : 0) - (a.userId ? 1 : 0) ||
      b.counts.apps - a.counts.apps ||
      b.counts.total - a.counts.total ||
      a.id.localeCompare(b.id));
    const [keep, ...drop] = enriched;

    console.log(`"${keep.name}"  team=${keep.teamId}  sport=${keep.sport}`);
    console.log(`   KEEP  ${keep.id}  ${keep.userId ? '[linked]' : '[guest] '}  apps=${keep.counts.apps} refs=${keep.counts.total}`);
    for (const d of drop) {
      console.log(`   MERGE ${d.id}  ${d.userId ? '[linked]' : '[guest] '}  apps=${d.counts.apps} refs=${d.counts.total}`);
      if (d.userId && keep.userId && d.userId !== keep.userId) {
        console.log('      !! both rows link to DIFFERENT accounts — skipping, this needs a human');
        continue;
      }
      if (!APPLY) { merged++; continue; }

      await prisma.$transaction(async (tx) => {
        // MatchPlayer is unique on (matchId, playerId): if both rows appear in
        // the same match, repointing would collide, so drop the loser's row.
        const theirs = await tx.matchPlayer.findMany({ where: { playerId: d.id }, select: { id: true, matchId: true } });
        const keepMatches = new Set(
          (await tx.matchPlayer.findMany({ where: { playerId: keep.id }, select: { matchId: true } })).map((m) => m.matchId),
        );
        for (const mp of theirs) {
          if (keepMatches.has(mp.matchId)) await tx.matchPlayer.delete({ where: { id: mp.id } });
          else await tx.matchPlayer.update({ where: { id: mp.id }, data: { playerId: keep.id } });
        }

        await tx.ball.updateMany({ where: { batterId: d.id }, data: { batterId: keep.id } });
        await tx.ball.updateMany({ where: { nonStrikerId: d.id }, data: { nonStrikerId: keep.id } });
        await tx.ball.updateMany({ where: { bowlerId: d.id }, data: { bowlerId: keep.id } });
        await tx.ball.updateMany({ where: { dismissedPlayerId: d.id }, data: { dismissedPlayerId: keep.id } });
        await tx.over.updateMany({ where: { bowlerId: d.id }, data: { bowlerId: keep.id } });
        await tx.sportEvent.updateMany({ where: { playerId: d.id }, data: { playerId: keep.id } });
        await tx.matchMVP.updateMany({ where: { playerId: d.id }, data: { playerId: keep.id } });
        // Inning.strikerId / nonStrikerId / currentBowlerId are bare columns with
        // no FK, so they need repointing by hand or a finished match would render
        // a crease pointing at a deleted player.
        await tx.inning.updateMany({ where: { strikerId: d.id }, data: { strikerId: keep.id } });
        await tx.inning.updateMany({ where: { nonStrikerId: d.id }, data: { nonStrikerId: keep.id } });
        await tx.inning.updateMany({ where: { currentBowlerId: d.id }, data: { currentBowlerId: keep.id } });

        await tx.player.delete({ where: { id: d.id } });
      });
      merged++;
      console.log('      merged');
    }
    console.log('');
  }

  console.log(APPLY
    ? `Done — ${plural(merged, 'row')} merged away.`
    : `Would merge ${plural(merged, 'row')}. Re-run with --apply to do it.`);

  // Report-only: duplicate TEAMS. This is where the real duplication turned out
  // to live — 'Mumbai Mavericks' exists as two Team rows, each with its own full
  // 11-player squad, so "Rohit Sharma twice" is two players on two teams, not two
  // rows for one player. Merging across teams is deliberately NOT done here:
  // matches, innings and tournament entries all point at teamId, and one of each
  // pair usually has a single match against the other's twelve, which reads far
  // more like a second seed run than a real club.
  const teams = await prisma.team.findMany({ where, select: { id: true, name: true, sport: true } });
  const teamGroups = new Map();
  for (const t of teams) {
    const key = `${t.sport}::${(t.name || '').trim().toLowerCase()}`;
    if (!teamGroups.has(key)) teamGroups.set(key, []);
    teamGroups.get(key).push(t);
  }
  const dupTeams = [...teamGroups.values()].filter((g) => g.length > 1);
  if (dupTeams.length) {
    console.log(`\n${dupTeams.length} duplicate TEAM name(s) — reported only, never merged:`);
    for (const g of dupTeams) {
      console.log(`  "${g[0].name}"`);
      for (const t of g) {
        const [players, matches] = await Promise.all([
          prisma.player.count({ where: { teamId: t.id } }),
          prisma.match.count({ where: { OR: [{ team1Id: t.id }, { team2Id: t.id }] } }),
        ]);
        console.log(`     ${t.id}  players=${String(players).padStart(2)}  matches=${matches}`);
      }
    }
    console.log('\n  This is what double-counts the fielding tallies: catches match by');
    console.log('  NAME, so the same person on both squads collects the full tally twice.');
  }
  console.log('\nNote: this does not fix the CAUSE. Ball.wicketAssists still stores the');
  console.log('catcher by name rather than id, so a future duplicate re-splits the');
  console.log('fielding tallies the same way.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
