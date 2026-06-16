// Seed the remaining racquet sports (table tennis, squash, pickleball) to parity as
// INDIVIDUAL (1v1) sports: each competitor is a Team named after the player; matches
// are Player vs Player with real sport-events so score ("N games") and /sport-stats
// compute. Plus community posts. Idempotent (upsert + dedupe eventless). Run:
//   node prisma/seedRacquet.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// event tuple: [competitorKey, eventType, periodNum, value]
const SPORTS = [
  {
    id: 'tabletennis',
    comps: [
      { id: 'seed-tt1', name: 'Arjun Das',  city: 'Pune' },
      { id: 'seed-tt2', name: 'Li Wei',      city: 'Singapore' },
      { id: 'seed-tt3', name: 'Meera Shah',  city: 'Mumbai' },
      { id: 'seed-tt4', name: 'Hiro Tanaka', city: 'Tokyo' },
    ],
    matches: [
      { id: 'seed-ttm-live', t1: 'seed-tt1', t2: 'seed-tt2', status: 'live', venue: 'Paddle Hall, Pune', matchType: 'Best of 5', score1: '1', score2: '0',
        events: [['seed-tt1','game-win',1,1],['seed-tt1','ace',1,1],['seed-tt1','point',1,1],['seed-tt2','point',1,1],['seed-tt1','point',2,1]] },
      { id: 'seed-ttm-done', t1: 'seed-tt3', t2: 'seed-tt4', status: 'completed', venue: 'TT Centre, Mumbai', matchType: 'Best of 5', score1: '3', score2: '1', result: 'Meera Shah won 3–1',
        events: [['seed-tt3','game-win',1,1],['seed-tt4','game-win',2,1],['seed-tt3','game-win',3,1],['seed-tt3','game-win',4,1],['seed-tt3','ace',1,1],['seed-tt4','ace',2,1],['seed-tt3','point',3,1]] },
    ],
    posts: [
      { authorName: 'Arjun Das', text: 'Took the opener 11-7 — forehand loop is on point today! 🏓', likes: 22 },
      { authorName: 'Meera Shah', text: 'Closed it out 3-1. Serve variation made the difference.', likes: 31 },
    ],
  },
  {
    id: 'squash',
    comps: [
      { id: 'seed-sq1', name: 'Omar Faruq', city: 'Chennai' },
      { id: 'seed-sq2', name: 'Dev Menon',  city: 'Kochi' },
      { id: 'seed-sq3', name: 'Tara Singh',  city: 'Delhi' },
      { id: 'seed-sq4', name: 'Yuki Mori',  city: 'Osaka' },
    ],
    matches: [
      { id: 'seed-sqm-live', t1: 'seed-sq1', t2: 'seed-sq2', status: 'live', venue: 'Glass Court, Chennai', matchType: 'Best of 5', score1: '1', score2: '0',
        events: [['seed-sq1','game-win',1,1],['seed-sq1','point',1,1],['seed-sq1','stroke',1,1],['seed-sq2','point',1,1],['seed-sq1','point',2,1]] },
      { id: 'seed-sqm-done', t1: 'seed-sq3', t2: 'seed-sq4', status: 'completed', venue: 'Squash Dome, Delhi', matchType: 'Best of 5', score1: '3', score2: '2', result: 'Tara Singh won 3–2',
        events: [['seed-sq3','game-win',1,1],['seed-sq4','game-win',2,1],['seed-sq3','game-win',3,1],['seed-sq4','game-win',4,1],['seed-sq3','game-win',5,1],['seed-sq3','stroke',1,1],['seed-sq4','stroke',2,1],['seed-sq3','point',5,1]] },
    ],
    posts: [
      { authorName: 'Omar Faruq', text: 'One game up at the Glass Court — length is tight tonight.', likes: 14 },
      { authorName: 'Tara Singh', text: 'Five-game war but I got the decider 11-9. Legs are done! 😅', likes: 28 },
    ],
  },
  {
    id: 'pickleball',
    comps: [
      { id: 'seed-pb1', name: 'Greg Hall', city: 'Bengaluru' },
      { id: 'seed-pb2', name: 'Nina Park', city: 'Seoul' },
      { id: 'seed-pb3', name: 'Sam Cole',  city: 'Hyderabad' },
      { id: 'seed-pb4', name: 'Ravi Iyer', city: 'Chennai' },
    ],
    matches: [
      { id: 'seed-pbm-live', t1: 'seed-pb1', t2: 'seed-pb2', status: 'live', venue: 'Dink Courts, Bengaluru', matchType: 'Singles', score1: '1', score2: '0',
        events: [['seed-pb1','game-win',1,1],['seed-pb1','ace',1,1],['seed-pb1','point',1,1],['seed-pb2','point',1,1],['seed-pb1','point',2,1]] },
      { id: 'seed-pbm-done', t1: 'seed-pb3', t2: 'seed-pb4', status: 'completed', venue: 'Paddle Park, Hyderabad', matchType: 'Best of 3', score1: '2', score2: '1', result: 'Sam Cole won 2–1',
        events: [['seed-pb3','game-win',1,1],['seed-pb4','game-win',2,1],['seed-pb3','game-win',3,1],['seed-pb3','ace',1,1],['seed-pb4','ace',2,1],['seed-pb3','point',3,1]] },
    ],
    posts: [
      { authorName: 'Greg Hall', text: 'Won the first to 11 — third-shot drops are landing! 🥒', likes: 18 },
      { authorName: 'Sam Cole', text: 'Comeback 2-1! Soft game beats power every time.', likes: 25 },
    ],
  },
];

async function main() {
  for (const sp of SPORTS) {
    for (const c of sp.comps) {
      await prisma.team.upsert({ where: { id: c.id }, update: { name: c.name, city: c.city, sport: sp.id }, create: { ...c, sport: sp.id } });
      const existing = await prisma.player.findFirst({ where: { name: c.name, teamId: c.id } });
      if (!existing) await prisma.player.create({ data: { name: c.name, role: 'Singles', sport: sp.id, teamId: c.id, stats: { matches: 90, wins: 55 } } });
    }

    const myIds = sp.matches.map((m) => m.id);
    const stale = await prisma.match.findMany({ where: { sport: sp.id, id: { notIn: myIds }, sportEvents: { none: {} } }, select: { id: true } });
    for (const m of stale) {
      await prisma.sportEvent.deleteMany({ where: { matchId: m.id } });
      await prisma.match.delete({ where: { id: m.id } });
    }

    for (const m of sp.matches) {
      const { events, t1, t2, ...rest } = m;
      const data = { ...rest, team1Id: t1, team2Id: t2, sport: sp.id };
      await prisma.match.upsert({ where: { id: m.id }, update: data, create: data });
      await prisma.sportEvent.deleteMany({ where: { matchId: m.id } });
      for (const [teamId, eventType, periodNum, value] of events) {
        await prisma.sportEvent.create({ data: { matchId: m.id, sport: sp.id, teamId, eventType, value, period: 'game', periodNum } });
      }
    }

    for (const post of sp.posts) {
      const existing = await prisma.post.findFirst({ where: { authorName: post.authorName, text: post.text } });
      if (!existing) await prisma.post.create({ data: { sport: sp.id, team: null, ...post } });
    }

    const mc = await prisma.match.count({ where: { sport: sp.id } });
    const ec = await prisma.sportEvent.count({ where: { sport: sp.id } });
    console.log(`✓ ${sp.id.padEnd(12)} ${mc} matches, ${ec} events, ${sp.posts.length} posts`);
  }
  console.log('Racquet seed done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
