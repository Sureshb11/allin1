// Seed badminton to flagship parity as an INDIVIDUAL (1v1) sport: each competitor
// is a Team row named after the player (singles), matches are Player vs Player with
// real sport-events (game-win / point / ace / fault) so score ("N games") and
// /sport-stats (games / points / aces) compute. Plus community posts.
// Idempotent — safe to re-run. Run:  node prisma/seedBadminton.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Competitors modelled as single-player "teams" (the 1v1 approach — no schema change).
const COMPETITORS = [
  { id: 'seed-bdp1', name: 'Anaya Reddy', city: 'Hyderabad', sport: 'badminton' },
  { id: 'seed-bdp2', name: 'Vikram Joshi', city: 'Bengaluru', sport: 'badminton' },
  { id: 'seed-bdp3', name: 'Saina N.',     city: 'Hyderabad', sport: 'badminton' },
  { id: 'seed-bdp4', name: 'Kiran Rao',    city: 'Chennai',   sport: 'badminton' },
];

// Players for Find Players (sport-scoped).
const PLAYERS = [
  { name: 'Anaya Reddy',  role: 'Singles', sport: 'badminton', teamId: 'seed-bdp1', stats: { matches: 156, wins: 112, titles: 9, style: 'Attacking singles' } },
  { name: 'Vikram Joshi', role: 'Singles', sport: 'badminton', teamId: 'seed-bdp2', stats: { matches: 140, wins: 88,  titles: 5, style: 'Defensive singles' } },
  { name: 'Saina N.',     role: 'Singles', sport: 'badminton', teamId: 'seed-bdp3', stats: { matches: 210, wins: 168, titles: 14, style: 'All-court' } },
  { name: 'Kiran Rao',    role: 'Singles', sport: 'badminton', teamId: 'seed-bdp4', stats: { matches: 96,  wins: 61,  titles: 3, style: 'Counter-attacker' } },
];

// event: [teamId, eventType, periodNum (game), value]
const MATCHES = [
  {
    id: 'seed-bdm-live', team1Id: 'seed-bdp1', team2Id: 'seed-bdp2', sport: 'badminton',
    status: 'live', venue: 'Smash Arena, Hyderabad', matchType: 'Singles',
    score1: '1', score2: '0', currentInnings: 2,
    events: [
      ['seed-bdp1', 'game-win', 1, 1], // Anaya takes game 1
      ['seed-bdp1', 'ace',      1, 1],
      ['seed-bdp1', 'point',    1, 1], ['seed-bdp1', 'point', 1, 1], ['seed-bdp2', 'point', 1, 1],
      ['seed-bdp2', 'point',    2, 1], ['seed-bdp1', 'point', 2, 1], // game 2 in progress
    ],
  },
  {
    id: 'seed-bdm-done', team1Id: 'seed-bdp3', team2Id: 'seed-bdp4', sport: 'badminton',
    status: 'completed', venue: 'Rally Dome, Chennai', matchType: 'Singles',
    score1: '2', score2: '1', result: 'Saina N. won 2–1',
    events: [
      ['seed-bdp3', 'game-win', 1, 1],
      ['seed-bdp4', 'game-win', 2, 1],
      ['seed-bdp3', 'game-win', 3, 1],
      ['seed-bdp3', 'ace', 1, 1], ['seed-bdp3', 'ace', 3, 1], ['seed-bdp4', 'ace', 2, 1],
      ['seed-bdp3', 'point', 1, 1], ['seed-bdp4', 'point', 2, 1], ['seed-bdp3', 'point', 3, 1],
    ],
  },
];

const POSTS = [
  { authorName: 'Anaya Reddy', team: null, text: 'Took the first game 21-18 at Smash Arena — smashes landing today! 🏸', likes: 37 },
  { authorName: 'Local Legends', team: null, text: 'LIVE: Anaya Reddy leads Vikram Joshi 1-0 in games. Tight rallies in game 2!', likes: 14 },
  { authorName: 'Saina N.', team: null, text: 'Three-game thriller but got it done 2-1. Net play was the difference 🙌', likes: 52 },
  { authorName: 'Kiran Rao', team: null, text: 'Gave it everything, lost a close decider. Back on the court tomorrow.', likes: 11 },
];

async function main() {
  for (const t of COMPETITORS) {
    await prisma.team.upsert({ where: { id: t.id }, update: { name: t.name, city: t.city, sport: t.sport }, create: t });
  }
  for (const p of PLAYERS) {
    const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
    if (existing) await prisma.player.update({ where: { id: existing.id }, data: { role: p.role, sport: p.sport, stats: p.stats } });
    else await prisma.player.create({ data: p });
  }

  // Remove older eventless badminton matches (e.g. seedMultiSport's club-vs-club one)
  // and any prior duplicates of ours, so the feed shows only the 1v1 seed matches.
  const myIds = MATCHES.map((m) => m.id);
  const stale = await prisma.match.findMany({
    where: { sport: 'badminton', id: { notIn: myIds }, sportEvents: { none: {} } },
    select: { id: true },
  });
  for (const m of stale) {
    await prisma.sportEvent.deleteMany({ where: { matchId: m.id } });
    await prisma.match.delete({ where: { id: m.id } });
    console.log(`✗ removed eventless badminton match ${m.id}`);
  }

  for (const m of MATCHES) {
    const { events, ...match } = m;
    await prisma.match.upsert({ where: { id: match.id }, update: match, create: match });
    await prisma.sportEvent.deleteMany({ where: { matchId: match.id } });
    for (const [teamId, eventType, periodNum, value] of events) {
      await prisma.sportEvent.create({
        data: { matchId: match.id, sport: 'badminton', teamId, eventType, value, period: 'game', periodNum },
      });
    }
    console.log(`✓ match ${match.id} (${match.status}) + ${events.length} events`);
  }

  for (const post of POSTS) {
    const existing = await prisma.post.findFirst({ where: { authorName: post.authorName, text: post.text } });
    if (!existing) await prisma.post.create({ data: { sport: 'badminton', ...post } });
  }

  const ec = await prisma.sportEvent.count({ where: { sport: 'badminton' } });
  const pc = await prisma.post.count({ where: { sport: 'badminton' } });
  const mc = await prisma.match.count({ where: { sport: 'badminton' } });
  console.log(`Badminton: ${mc} matches, ${ec} events, ${pc} posts. Done.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
