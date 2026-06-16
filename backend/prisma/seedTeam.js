// Seed the big-3 team sports (basketball, kabaddi, hockey) to parity: team-vs-team
// matches with real sport-events so score + /sport-stats compute, plus community posts.
// Events are tuned so computeSportScore matches the stored score1/score2.
// Idempotent (upsert + dedupe eventless). Run:  node prisma/seedTeam.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// event tuple: [teamKey, eventType, periodNum, value]
const SPORTS = [
  {
    id: 'basketball', period: 'quarter',
    teams: [
      { id: 'seed-bk1', name: 'Mumbai Hoopers', city: 'Mumbai' },
      { id: 'seed-bk2', name: 'Delhi Dunkers',  city: 'Delhi' },
    ],
    players: [
      { name: 'Jai Kapoor', role: 'Guard',   teamId: 'seed-bk1' },
      { name: 'Marcus Lee', role: 'Center',  teamId: 'seed-bk1' },
      { name: 'Rohit Sen',  role: 'Forward', teamId: 'seed-bk2' },
    ],
    matches: [
      { id: 'seed-bkm-live', t1: 'seed-bk1', t2: 'seed-bk2', status: 'live', venue: 'Hoop Arena, Mumbai', matchType: 'Full Game', score1: '11', score2: '8',
        events: [['seed-bk1','2pt',1,2],['seed-bk1','2pt',1,2],['seed-bk1','2pt',2,2],['seed-bk1','3pt',2,3],['seed-bk1','freethrow',2,1],['seed-bk1','freethrow',3,1],['seed-bk1','timeout',1,0],
                 ['seed-bk2','2pt',1,2],['seed-bk2','2pt',2,2],['seed-bk2','3pt',2,3],['seed-bk2','freethrow',3,1],['seed-bk2','foul',2,0],['seed-bk2','foul',3,0]] },
      { id: 'seed-bkm-done', t1: 'seed-bk1', t2: 'seed-bk2', status: 'completed', venue: 'Dunk Dome, Delhi', matchType: 'Full Game', score1: '8', score2: '7', result: 'Mumbai Hoopers won 8–7',
        events: [['seed-bk1','2pt',1,2],['seed-bk1','2pt',2,2],['seed-bk1','3pt',3,3],['seed-bk1','freethrow',4,1],
                 ['seed-bk2','2pt',1,2],['seed-bk2','2pt',2,2],['seed-bk2','2pt',3,2],['seed-bk2','freethrow',4,1],['seed-bk2','foul',2,0]] },
    ],
    posts: [
      { authorName: 'Jai Kapoor', text: 'Up 11-8 at the half — defense is locked in! 🏀', likes: 26 },
      { authorName: 'Mumbai Hoopers', text: 'Grind-it-out 8-7 win on the road. Big stops late.', likes: 33 },
    ],
  },
  {
    id: 'kabaddi', period: 'half',
    teams: [
      { id: 'seed-kb1', name: 'Chennai Raiders', city: 'Chennai' },
      { id: 'seed-kb2', name: 'Pune Paltan',     city: 'Pune' },
    ],
    players: [
      { name: 'Surya R',   role: 'Raider',      teamId: 'seed-kb1' },
      { name: 'Bala K',    role: 'Defender',    teamId: 'seed-kb1' },
      { name: 'Manoj P',   role: 'All-rounder', teamId: 'seed-kb2' },
    ],
    matches: [
      { id: 'seed-kbm-live', t1: 'seed-kb1', t2: 'seed-kb2', status: 'live', venue: 'Raid Arena, Chennai', matchType: 'Pro Kabaddi', score1: '8', score2: '3',
        events: [['seed-kb1','touch-point',1,1],['seed-kb1','touch-point',1,1],['seed-kb1','touch-point',1,1],['seed-kb1','bonus-point',1,1],['seed-kb1','tackle-point',2,1],['seed-kb1','tackle-point',2,1],['seed-kb1','all-out',2,2],
                 ['seed-kb2','touch-point',1,1],['seed-kb2','touch-point',1,1],['seed-kb2','tackle-point',2,1]] },
      { id: 'seed-kbm-done', t1: 'seed-kb1', t2: 'seed-kb2', status: 'completed', venue: 'Paltan Mat, Pune', matchType: 'Pro Kabaddi', score1: '11', score2: '7', result: 'Chennai Raiders won 11–7',
        events: [['seed-kb1','touch-point',1,1],['seed-kb1','touch-point',1,1],['seed-kb1','touch-point',1,1],['seed-kb1','touch-point',2,1],['seed-kb1','bonus-point',1,1],['seed-kb1','bonus-point',2,1],['seed-kb1','tackle-point',2,1],['seed-kb1','tackle-point',2,1],['seed-kb1','tackle-point',2,1],['seed-kb1','all-out',2,2],
                 ['seed-kb2','touch-point',1,1],['seed-kb2','touch-point',1,1],['seed-kb2','touch-point',2,1],['seed-kb2','tackle-point',2,1],['seed-kb2','tackle-point',2,1],['seed-kb2','all-out',2,2]] },
    ],
    posts: [
      { authorName: 'Surya R', text: 'Super raid for the all-out! 8-3 up at the break 🔥', likes: 29 },
      { authorName: 'Chennai Raiders', text: '11-7 win — defense held strong in the second half. Whatte match!', likes: 41 },
    ],
  },
  {
    id: 'hockey', period: 'quarter',
    teams: [
      { id: 'seed-hk1', name: 'Coorg Strikers',  city: 'Coorg' },
      { id: 'seed-hk2', name: 'Punjab Warriors', city: 'Jalandhar' },
    ],
    players: [
      { name: 'Anil Xess',  role: 'Forward',    teamId: 'seed-hk1' },
      { name: 'Gurpreet S', role: 'Defender',   teamId: 'seed-hk2' },
      { name: 'Deepak T',   role: 'Goalkeeper', teamId: 'seed-hk1' },
    ],
    matches: [
      { id: 'seed-hkm-live', t1: 'seed-hk1', t2: 'seed-hk2', status: 'live', venue: 'Turf Park, Coorg', matchType: 'Field (4Q)', score1: '2', score2: '1',
        events: [['seed-hk1','goal',1,1],['seed-hk1','goal',2,1],['seed-hk1','penalty-corner',2,0],
                 ['seed-hk2','goal',2,1],['seed-hk2','penalty-corner',1,0],['seed-hk2','yellow-card',2,0]] },
      { id: 'seed-hkm-done', t1: 'seed-hk1', t2: 'seed-hk2', status: 'completed', venue: 'Warriors Astro, Jalandhar', matchType: 'Field (4Q)', score1: '3', score2: '2', result: 'Coorg Strikers won 3–2',
        events: [['seed-hk1','goal',1,1],['seed-hk1','goal',2,1],['seed-hk1','goal',4,1],['seed-hk1','penalty-corner',1,0],
                 ['seed-hk2','goal',2,1],['seed-hk2','goal',3,1],['seed-hk2','penalty-corner',3,0],['seed-hk2','penalty-corner',4,0],['seed-hk2','yellow-card',3,0]] },
    ],
    posts: [
      { authorName: 'Anil Xess', text: 'Two field goals and we lead 2-1! Press is working. 🏑', likes: 19 },
      { authorName: 'Coorg Strikers', text: '3-2 win — converted the PC when it mattered. Onto the next!', likes: 24 },
    ],
  },
];

async function main() {
  for (const sp of SPORTS) {
    for (const t of sp.teams) {
      await prisma.team.upsert({ where: { id: t.id }, update: { name: t.name, city: t.city, sport: sp.id }, create: { ...t, sport: sp.id } });
    }
    for (const p of sp.players) {
      const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
      if (!existing) await prisma.player.create({ data: { name: p.name, role: p.role, sport: sp.id, teamId: p.teamId, stats: { matches: 60, wins: 34 } } });
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
        await prisma.sportEvent.create({ data: { matchId: m.id, sport: sp.id, teamId, eventType, value, period: sp.period, periodNum } });
      }
    }

    for (const post of sp.posts) {
      const existing = await prisma.post.findFirst({ where: { authorName: post.authorName, text: post.text } });
      if (!existing) await prisma.post.create({ data: { sport: sp.id, team: null, ...post } });
    }

    const mc = await prisma.match.count({ where: { sport: sp.id } });
    const ec = await prisma.sportEvent.count({ where: { sport: sp.id } });
    console.log(`✓ ${sp.id.padEnd(11)} ${mc} matches, ${ec} events, ${sp.posts.length} posts`);
  }
  console.log('Team seed done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
