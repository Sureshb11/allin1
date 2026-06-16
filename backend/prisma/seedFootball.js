// Seed football to flagship parity: 2 teams, players, a LIVE + a COMPLETED match
// WITH real sport-events (goals / cards / corners) so the event-based scorer and
// /matches/:id/sport-stats return real data, plus community posts for the feed.
// Idempotent — safe to re-run (upsert by stable id; events re-created each run).
//
//   node prisma/seedFootball.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEAMS = [
  { id: 'seed-fc1', name: 'Chennai City FC',  city: 'Chennai',   sport: 'football' },
  { id: 'seed-fc2', name: 'Bengaluru Rovers', city: 'Bengaluru', sport: 'football' },
];

const PLAYERS = [
  { name: 'Diego Fernandes', role: 'Striker',    sport: 'football', teamId: 'seed-fc1', stats: { matches: 88,  goals: 61, assists: 22, style: 'Right foot · Forward' } },
  { name: 'Arjun Pillai',    role: 'Midfielder', sport: 'football', teamId: 'seed-fc1', stats: { matches: 102, goals: 18, assists: 47, style: 'Box-to-box' } },
  { name: 'Marco Silva',     role: 'Defender',   sport: 'football', teamId: 'seed-fc1', stats: { matches: 110, goals: 6,  assists: 9,  style: 'Centre-back' } },
  { name: 'Kenji Watanabe',  role: 'Goalkeeper', sport: 'football', teamId: 'seed-fc2', stats: { matches: 95,  cleanSheets: 38, saves: 410, style: 'Shot-stopper' } },
  { name: 'Rahul Nair',      role: 'Striker',    sport: 'football', teamId: 'seed-fc2', stats: { matches: 74,  goals: 44, assists: 15, style: 'Left foot · Forward' } },
  { name: 'Sergio Mendez',   role: 'Midfielder', sport: 'football', teamId: 'seed-fc2', stats: { matches: 130, goals: 25, assists: 53, style: 'Playmaker' } },
];

// Matches keyed by stable id so events attach deterministically + re-run cleanly.
const MATCHES = [
  {
    id: 'seed-fbm-live', team1Id: 'seed-fc1', team2Id: 'seed-fc2', sport: 'football',
    status: 'live', venue: 'Marina Arena, Chennai', matchType: 'League',
    score1: '2', score2: '1', currentInnings: 2,
    // event: [teamId, type, periodNum, value, minute]
    events: [
      ['seed-fc1', 'goal',        1, 1, 12],
      ['seed-fc2', 'corner',      1, 0, 20],
      ['seed-fc1', 'goal',        1, 1, 34],
      ['seed-fc2', 'yellow-card', 2, 0, 58],
      ['seed-fc2', 'goal',        2, 1, 67],
      ['seed-fc1', 'corner',      2, 0, 71],
    ],
  },
  {
    id: 'seed-fbm-done', team1Id: 'seed-fc2', team2Id: 'seed-fc1', sport: 'football',
    status: 'completed', venue: 'Rovers Park, Bengaluru', matchType: 'League',
    score1: '0', score2: '3', result: 'Chennai City FC won 3–0',
    events: [
      ['seed-fc1', 'goal',        1, 1, 9],
      ['seed-fc1', 'goal',        1, 1, 41],
      ['seed-fc2', 'yellow-card', 2, 0, 55],
      ['seed-fc1', 'goal',        2, 1, 78],
      ['seed-fc1', 'corner',      2, 0, 84],
    ],
  },
];

const POSTS = [
  { authorName: 'Diego Fernandes', team: 'Chennai City FC',  text: 'Brace tonight under the lights at Marina Arena! 2 up at the half ⚽🔥', likes: 41 },
  { authorName: 'Local Legends',   team: null,               text: 'LIVE: Chennai City FC 2–1 Bengaluru Rovers — end-to-end stuff in the second half.', likes: 18 },
  { authorName: 'Sergio Mendez',   team: 'Bengaluru Rovers', text: 'Pulled one back but we need a leveller. Come on Rovers! 💙', likes: 12 },
  { authorName: 'Marco Silva',     team: 'Chennai City FC',  text: 'Clean at the back for most of it. Set-piece defending was 💯 today.', likes: 9 },
];

async function main() {
  for (const t of TEAMS) {
    await prisma.team.upsert({ where: { id: t.id }, update: { name: t.name, city: t.city, sport: t.sport }, create: t });
  }
  for (const p of PLAYERS) {
    const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
    if (existing) await prisma.player.update({ where: { id: existing.id }, data: { role: p.role, sport: p.sport, stats: p.stats } });
    else await prisma.player.create({ data: p });
  }

  // Remove older eventless duplicates of our matches (e.g. from seedMultiSport.js)
  // that share our venues but not our stable ids, so the feed shows each match once.
  const myIds = MATCHES.map((m) => m.id);
  const myVenues = MATCHES.map((m) => m.venue);
  const dupes = await prisma.match.findMany({ where: { sport: 'football', venue: { in: myVenues }, id: { notIn: myIds } }, select: { id: true } });
  for (const d of dupes) {
    await prisma.sportEvent.deleteMany({ where: { matchId: d.id } });
    await prisma.match.delete({ where: { id: d.id } });
    console.log(`✗ removed duplicate match ${d.id}`);
  }

  for (const m of MATCHES) {
    const { events, ...match } = m;
    await prisma.match.upsert({ where: { id: match.id }, update: match, create: match });
    // Re-create events idempotently.
    await prisma.sportEvent.deleteMany({ where: { matchId: match.id } });
    for (const [teamId, eventType, periodNum, value, minute] of events) {
      await prisma.sportEvent.create({
        data: { matchId: match.id, sport: 'football', teamId, eventType, value, period: 'half', periodNum, metadata: { minute } },
      });
    }
    console.log(`✓ match ${match.id} (${match.status}) + ${events.length} events`);
  }

  for (const post of POSTS) {
    const existing = await prisma.post.findFirst({ where: { authorName: post.authorName, text: post.text } });
    if (!existing) await prisma.post.create({ data: { sport: 'football', ...post } });
  }

  const mc = await prisma.match.groupBy({ by: ['sport'], _count: true });
  console.log('Matches by sport:', mc.map((c) => `${c.sport}:${c._count}`).join('  '));
  const ec = await prisma.sportEvent.count({ where: { sport: 'football' } });
  const pc = await prisma.post.count({ where: { sport: 'football' } });
  console.log(`Football: ${ec} events, ${pc} posts. Done.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
