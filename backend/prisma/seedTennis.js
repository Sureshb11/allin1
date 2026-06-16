// Seed tennis to flagship parity as an INDIVIDUAL (1v1) sport: each competitor is a
// Team named after the player (singles); matches are Player vs Player with real
// sport-events (set-win / game-win / ace / double-fault) so score ("N sets") and
// /sport-stats (aces / double-faults) compute. Plus posts. Idempotent.
//   node prisma/seedTennis.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPETITORS = [
  { id: 'seed-tnp1', name: 'Isha Rao',     city: 'Mumbai',    sport: 'tennis' },
  { id: 'seed-tnp2', name: 'Rahul Mehta',  city: 'Delhi',     sport: 'tennis' },
  { id: 'seed-tnp3', name: 'Sana Kapoor',  city: 'Bengaluru', sport: 'tennis' },
  { id: 'seed-tnp4', name: 'Neha Joshi',   city: 'Pune',      sport: 'tennis' },
];

const PLAYERS = [
  { name: 'Isha Rao',    role: 'Singles', sport: 'tennis', teamId: 'seed-tnp1', stats: { matches: 120, wins: 88,  titles: 6, style: 'Aggressive baseliner' } },
  { name: 'Rahul Mehta', role: 'Singles', sport: 'tennis', teamId: 'seed-tnp2', stats: { matches: 134, wins: 79,  titles: 4, style: 'Serve & volley' } },
  { name: 'Sana Kapoor', role: 'Singles', sport: 'tennis', teamId: 'seed-tnp3', stats: { matches: 188, wins: 142, titles: 11, style: 'All-court' } },
  { name: 'Neha Joshi',  role: 'Singles', sport: 'tennis', teamId: 'seed-tnp4', stats: { matches: 101, wins: 60,  titles: 3, style: 'Counter-puncher' } },
];

// event: [teamId, eventType, periodNum (set), value]
const MATCHES = [
  {
    id: 'seed-tnm-live', team1Id: 'seed-tnp1', team2Id: 'seed-tnp2', sport: 'tennis',
    status: 'live', venue: 'Centre Court, Mumbai', matchType: 'Best of 3',
    score1: '1', score2: '0', currentInnings: 2,
    events: [
      ['seed-tnp1', 'set-win',  1, 1],          // Isha takes set 1
      ['seed-tnp1', 'ace',      1, 1], ['seed-tnp1', 'ace', 1, 1], ['seed-tnp2', 'ace', 1, 1],
      ['seed-tnp2', 'double-fault', 1, 0],
      ['seed-tnp1', 'game-win', 1, 1], ['seed-tnp1', 'game-win', 1, 1], ['seed-tnp2', 'game-win', 1, 1],
      ['seed-tnp1', 'game-win', 2, 1], ['seed-tnp2', 'game-win', 2, 1], // set 2 underway
    ],
  },
  {
    id: 'seed-tnm-done', team1Id: 'seed-tnp3', team2Id: 'seed-tnp4', sport: 'tennis',
    status: 'completed', venue: 'Baseline Arena, Bengaluru', matchType: 'Best of 3',
    score1: '2', score2: '1', result: 'Sana Kapoor won 2–1',
    events: [
      ['seed-tnp3', 'set-win', 1, 1],
      ['seed-tnp4', 'set-win', 2, 1],
      ['seed-tnp3', 'set-win', 3, 1],
      ['seed-tnp3', 'ace', 1, 1], ['seed-tnp3', 'ace', 3, 1], ['seed-tnp4', 'ace', 2, 1],
      ['seed-tnp4', 'double-fault', 1, 0], ['seed-tnp3', 'double-fault', 2, 0],
    ],
  },
];

const POSTS = [
  { authorName: 'Isha Rao', team: null, text: 'Pocketed the first set 6-4 on Centre Court. Serve is firing today! 🎾', likes: 33 },
  { authorName: 'Local Legends', team: null, text: 'LIVE: Isha Rao leads Rahul Mehta one set to love. Second set on serve.', likes: 12 },
  { authorName: 'Sana Kapoor', team: null, text: 'Three-set battle but came through 2-1. Loved every minute out there 🙌', likes: 47 },
  { authorName: 'Rahul Mehta', team: null, text: 'Net game felt sharp in practice — looking to level this one up.', likes: 8 },
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

  const myIds = MATCHES.map((m) => m.id);
  const stale = await prisma.match.findMany({
    where: { sport: 'tennis', id: { notIn: myIds }, sportEvents: { none: {} } },
    select: { id: true },
  });
  for (const m of stale) {
    await prisma.sportEvent.deleteMany({ where: { matchId: m.id } });
    await prisma.match.delete({ where: { id: m.id } });
    console.log(`✗ removed eventless tennis match ${m.id}`);
  }

  for (const m of MATCHES) {
    const { events, ...match } = m;
    await prisma.match.upsert({ where: { id: match.id }, update: match, create: match });
    await prisma.sportEvent.deleteMany({ where: { matchId: match.id } });
    for (const [teamId, eventType, periodNum, value] of events) {
      await prisma.sportEvent.create({
        data: { matchId: match.id, sport: 'tennis', teamId, eventType, value, period: 'set', periodNum },
      });
    }
    console.log(`✓ match ${match.id} (${match.status}) + ${events.length} events`);
  }

  for (const post of POSTS) {
    const existing = await prisma.post.findFirst({ where: { authorName: post.authorName, text: post.text } });
    if (!existing) await prisma.post.create({ data: { sport: 'tennis', ...post } });
  }

  const mc = await prisma.match.count({ where: { sport: 'tennis' } });
  const ec = await prisma.sportEvent.count({ where: { sport: 'tennis' } });
  const pc = await prisma.post.count({ where: { sport: 'tennis' } });
  console.log(`Tennis: ${mc} matches, ${ec} events, ${pc} posts. Done.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
