// Seed the combat sports (boxing, wrestling, judo, karate) to parity as INDIVIDUAL
// (1v1) sports — each competitor is a Team named after the fighter. Matches include
// SPECIAL-MOVE finishes (a KO, a pin, an ippon) plus point bouts, with events tuned so
// computeSportScore matches the stored score. Plus posts. Idempotent.
//   node prisma/seedCombat.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// repeat an event: [teamKey, type, periodNum, value]
const rep = (team, type, periodNum, n, value = 1) =>
  Array.from({ length: n }, () => [team, type, periodNum, value]);

const SPORTS = [
  {
    id: 'boxing', period: 'round',
    comps: [
      { id: 'seed-bx1', name: 'Rocky Dsouza', city: 'Goa' },
      { id: 'seed-bx2', name: 'Vijay Kumar', city: 'Haryana' },
      { id: 'seed-bx3', name: 'Tyson M', city: 'Mumbai' },
      { id: 'seed-bx4', name: 'Carl Reed', city: 'London' },
    ],
    players: [
      { name: 'Rocky Dsouza', role: 'Middleweight', teamId: 'seed-bx1' },
      { name: 'Tyson M',      role: 'Heavyweight',  teamId: 'seed-bx3' },
    ],
    matches: [
      { id: 'seed-bxm-live', t1: 'seed-bx1', t2: 'seed-bx2', status: 'live', venue: 'Fight Night Arena, Goa', matchType: '10 Rounds', score1: '2 rds', score2: '1 rds',
        events: [...rep('seed-bx1','round-win',1,1), ...rep('seed-bx1','round-win',2,1), ...rep('seed-bx2','round-win',3,1),
                 ...rep('seed-bx1','knockdown',2,1,0), ...rep('seed-bx1','punch-landed',1,8), ...rep('seed-bx2','punch-landed',1,6)] },
      { id: 'seed-bxm-done', t1: 'seed-bx3', t2: 'seed-bx4', status: 'completed', venue: 'Garden Arena, Mumbai', matchType: '12 Rounds', score1: 'KO Win', score2: '-', result: 'Tyson M won by KO — Round 7',
        events: [...rep('seed-bx3','ko',7,1,0), ...rep('seed-bx3','knockdown',7,2,0), ...rep('seed-bx3','punch-landed',1,12), ...rep('seed-bx4','punch-landed',1,9)] },
    ],
    posts: [
      { authorName: 'Rocky Dsouza', text: 'Dropped him in the 2nd — up two rounds to one! 🥊', likes: 27 },
      { authorName: 'Local Legends', text: 'KO! Tyson M ends it in the 7th with a thunderous right hand. 💥', likes: 58 },
    ],
  },
  {
    id: 'wrestling', period: 'period',
    comps: [
      { id: 'seed-wr1', name: 'Sushil P', city: 'Delhi' },
      { id: 'seed-wr2', name: 'Bajrang Y', city: 'Haryana' },
      { id: 'seed-wr3', name: 'Ravi K', city: 'Punjab' },
      { id: 'seed-wr4', name: 'Deepak N', city: 'UP' },
    ],
    players: [
      { name: 'Sushil P', role: 'Freestyle', teamId: 'seed-wr1' },
      { name: 'Ravi K',   role: 'Freestyle', teamId: 'seed-wr3' },
    ],
    matches: [
      { id: 'seed-wrm-live', t1: 'seed-wr1', t2: 'seed-wr2', status: 'live', venue: 'Akhara Arena, Delhi', matchType: 'Freestyle', score1: '5', score2: '4',
        events: [...rep('seed-wr1','takedown',1,2,2), ...rep('seed-wr1','escape',2,1,1), ...rep('seed-wr2','takedown',1,1,2), ...rep('seed-wr2','reversal',2,1,2)] },
      { id: 'seed-wrm-done', t1: 'seed-wr3', t2: 'seed-wr4', status: 'completed', venue: 'Mat Hall, Punjab', matchType: 'Freestyle', score1: 'Pin Win', score2: '-', result: 'Ravi K won by Pin — Period 2',
        events: [...rep('seed-wr3','takedown',1,2,2), ...rep('seed-wr3','pin',2,1,0), ...rep('seed-wr4','takedown',1,1,2), ...rep('seed-wr4','escape',1,1,1)] },
    ],
    posts: [
      { authorName: 'Sushil P', text: 'Two takedowns to lead 5-4 — controlling the tie-ups. 🤼', likes: 21 },
      { authorName: 'Ravi K', text: 'Pinned it in the second! Bridge held, shoulders down. 🏆', likes: 36 },
    ],
  },
  {
    id: 'judo', period: 'bout',
    comps: [
      { id: 'seed-jd1', name: 'Kenta S', city: 'Tokyo' },
      { id: 'seed-jd2', name: 'Marco B', city: 'Rio' },
      { id: 'seed-jd3', name: 'Hiro Y', city: 'Osaka' },
      { id: 'seed-jd4', name: 'Sang Lee', city: 'Seoul' },
    ],
    players: [
      { name: 'Kenta S', role: 'Middleweight', teamId: 'seed-jd1' },
      { name: 'Hiro Y',  role: 'Heavyweight',  teamId: 'seed-jd3' },
    ],
    matches: [
      { id: 'seed-jdm-live', t1: 'seed-jd1', t2: 'seed-jd2', status: 'live', venue: 'Tatami Hall, Tokyo', matchType: '4 Min Bout', score1: '12', score2: '5',
        events: [...rep('seed-jd1','waza-ari',1,1,7), ...rep('seed-jd1','yuko',1,1,5), ...rep('seed-jd2','yuko',1,1,5)] },
      { id: 'seed-jdm-done', t1: 'seed-jd3', t2: 'seed-jd4', status: 'completed', venue: 'Kodokan Dojo, Osaka', matchType: '4 Min Bout', score1: '10', score2: '5', result: 'Hiro Y won by Ippon!',
        events: [...rep('seed-jd3','ippon',1,1,10), ...rep('seed-jd4','yuko',1,1,5)] },
    ],
    posts: [
      { authorName: 'Kenta S', text: 'Waza-ari from the seoi-nage — 12-5 up! 🥋', likes: 18 },
      { authorName: 'Local Legends', text: 'IPPON! Hiro Y ends it instantly with a perfect uchi-mata. 🔥', likes: 44 },
    ],
  },
  {
    id: 'karate', period: 'bout',
    comps: [
      { id: 'seed-kr1', name: 'Akira T', city: 'Okinawa' },
      { id: 'seed-kr2', name: 'Sato N', city: 'Kyoto' },
      { id: 'seed-kr3', name: 'Leo F', city: 'Madrid' },
      { id: 'seed-kr4', name: 'Raj P', city: 'Pune' },
    ],
    players: [
      { name: 'Akira T', role: 'Kumite', teamId: 'seed-kr1' },
      { name: 'Leo F',   role: 'Kumite', teamId: 'seed-kr3' },
    ],
    matches: [
      { id: 'seed-krm-live', t1: 'seed-kr1', t2: 'seed-kr2', status: 'live', venue: 'Kumite Hall, Okinawa', matchType: 'Kumite', score1: '5', score2: '3',
        events: [...rep('seed-kr1','waza-ari',1,2,2), ...rep('seed-kr1','yuko',1,1,1), ...rep('seed-kr2','yuko',1,3,1)] },
      { id: 'seed-krm-done', t1: 'seed-kr3', t2: 'seed-kr4', status: 'completed', venue: 'Shotokan Dojo, Madrid', matchType: 'Kumite', score1: '6', score2: '4', result: 'Leo F won 6–4',
        events: [...rep('seed-kr3','ippon',1,1,3), ...rep('seed-kr3','waza-ari',2,1,2), ...rep('seed-kr3','yuko',2,1,1), ...rep('seed-kr4','waza-ari',1,1,2), ...rep('seed-kr4','yuko',2,2,1)] },
    ],
    posts: [
      { authorName: 'Akira T', text: 'Two waza-ari off the gyaku-zuki — 5-3! 🥋', likes: 16 },
      { authorName: 'Leo F', text: 'Ippon kick set the tone, closed it 6-4. Osu! 🙇', likes: 23 },
    ],
  },
];

async function main() {
  for (const sp of SPORTS) {
    for (const c of sp.comps) {
      await prisma.team.upsert({ where: { id: c.id }, update: { name: c.name, city: c.city, sport: sp.id }, create: { ...c, sport: sp.id } });
    }
    for (const p of sp.players) {
      const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
      if (!existing) await prisma.player.create({ data: { name: p.name, role: p.role, sport: sp.id, teamId: p.teamId, stats: { fights: 40, wins: 31, ko: 12 } } });
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
    console.log(`✓ ${sp.id.padEnd(10)} ${mc} matches, ${ec} events, ${sp.posts.length} posts`);
  }
  console.log('Combat seed done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
