// Seed the individual precision sports (golf, archery, bowling, snowboard) to parity.
// Each competitor is a Team named after the player; matches are competitor-vs-competitor
// with real sport-events so computeSportScore matches the stored score. Note these have
// non-versus scoring: golf = fewer strokes wins, archery = points, bowling = frames,
// snowboard = best run. Stored score = full computed string (e.g. "70 strokes"). Idempotent.
//   node prisma/seedIndividual.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// repeat an event: [teamKey, type, periodNum, value]
const rep = (team, type, periodNum, n, value = 1) =>
  Array.from({ length: n }, () => [team, type, periodNum, value]);

const SPORTS = [
  {
    id: 'golf', period: 'round',
    comps: [
      { id: 'seed-gf1', name: 'Tiger A', city: 'Florida' },
      { id: 'seed-gf2', name: 'Rory M', city: 'Belfast' },
    ],
    players: [
      { name: 'Tiger A', role: 'Pro', teamId: 'seed-gf1' },
      { name: 'Rory M', role: 'Pro', teamId: 'seed-gf2' },
    ],
    matches: [
      { id: 'seed-gfm-live', t1: 'seed-gf1', t2: 'seed-gf2', status: 'live', venue: 'Augusta Links', matchType: '18 Holes', score1: '34 strokes', score2: '37 strokes',
        events: [...rep('seed-gf1','stroke',1,34), ...rep('seed-gf2','stroke',1,37), ...rep('seed-gf1','birdie',1,3,0)] },
      { id: 'seed-gfm-done', t1: 'seed-gf1', t2: 'seed-gf2', status: 'completed', venue: 'St Andrews', matchType: '18 Holes', score1: '70 strokes', score2: '74 strokes', result: 'Tiger A won — 70 to 74 (fewer strokes)',
        events: [...rep('seed-gf1','stroke',1,70), ...rep('seed-gf2','stroke',1,74), ...rep('seed-gf1','birdie',1,4,0), ...rep('seed-gf1','hole-in-one',1,1,0)] },
    ],
    posts: [
      { authorName: 'Tiger A', text: 'Three birdies on the front nine — leading at 34. ⛳', likes: 24 },
      { authorName: 'Tiger A', text: 'Hole-in-one on 16! Sealed it 70 to 74. What a day. 🏌️', likes: 51 },
    ],
  },
  {
    id: 'archery', period: 'end',
    comps: [
      { id: 'seed-ar1', name: 'Deepika K', city: 'Ranchi' },
      { id: 'seed-ar2', name: 'Atanu D', city: 'Kolkata' },
    ],
    players: [
      { name: 'Deepika K', role: 'Recurve', teamId: 'seed-ar1' },
      { name: 'Atanu D', role: 'Recurve', teamId: 'seed-ar2' },
    ],
    matches: [
      { id: 'seed-arm-live', t1: 'seed-ar1', t2: 'seed-ar2', status: 'live', venue: 'Olympic Range, Ranchi', matchType: '6 Ends', score1: '29', score2: '26',
        events: [...rep('seed-ar1','arrow-10',1,2,10), ...rep('seed-ar1','arrow-9',1,1,9), ...rep('seed-ar2','arrow-10',1,1,10), ...rep('seed-ar2','arrow-8',1,2,8)] },
      { id: 'seed-arm-done', t1: 'seed-ar1', t2: 'seed-ar2', status: 'completed', venue: 'National Range, Kolkata', matchType: '6 Ends', score1: '56', score2: '46', result: 'Deepika K won 56–46',
        events: [...rep('seed-ar1','arrow-10',1,3,10), ...rep('seed-ar1','arrow-9',2,2,9), ...rep('seed-ar1','arrow-8',3,1,8), ...rep('seed-ar2','arrow-10',1,2,10), ...rep('seed-ar2','arrow-9',2,2,9), ...rep('seed-ar2','arrow-8',3,1,8)] },
    ],
    posts: [
      { authorName: 'Deepika K', text: 'Two 10s to open — 29 after the first end! 🎯', likes: 20 },
      { authorName: 'Deepika K', text: 'Held the line for a 56–46 win. Bullseyes paid off. 🏹', likes: 34 },
    ],
  },
  {
    id: 'bowling', period: 'frame',
    comps: [
      { id: 'seed-bw1', name: 'Ronnie S', city: 'Sheffield' },
      { id: 'seed-bw2', name: 'Pankaj A', city: 'Delhi' },
    ],
    players: [
      { name: 'Ronnie S', role: 'Snooker', teamId: 'seed-bw1' },
      { name: 'Pankaj A', role: 'Snooker', teamId: 'seed-bw2' },
    ],
    matches: [
      { id: 'seed-bwm-live', t1: 'seed-bw1', t2: 'seed-bw2', status: 'live', venue: 'Crucible Club, Sheffield', matchType: 'Snooker', score1: '4 frames', score2: '3 frames',
        events: [...rep('seed-bw1','frame-won',1,4), ...rep('seed-bw2','frame-won',1,3), ...rep('seed-bw1','pot',1,5), ...rep('seed-bw2','foul',1,1,0)] },
      { id: 'seed-bwm-done', t1: 'seed-bw1', t2: 'seed-bw2', status: 'completed', venue: 'Cue Arena, Delhi', matchType: 'Snooker', score1: '6 frames', score2: '4 frames', result: 'Ronnie S won 6–4 frames',
        events: [...rep('seed-bw1','frame-won',1,6), ...rep('seed-bw2','frame-won',1,4), ...rep('seed-bw1','pot',1,8), ...rep('seed-bw2','pot',1,5)] },
    ],
    posts: [
      { authorName: 'Ronnie S', text: 'Four frames to three — a couple of tasty breaks. 🎱', likes: 17 },
      { authorName: 'Ronnie S', text: 'Took it 6-4. Cue ball behaved all night. 🏆', likes: 22 },
    ],
  },
  {
    id: 'snowboard', period: 'run',
    comps: [
      { id: 'seed-sn1', name: 'Chloe K', city: 'Colorado' },
      { id: 'seed-sn2', name: 'Yuto T', city: 'Hokkaido' },
    ],
    players: [
      { name: 'Chloe K', role: 'Halfpipe', teamId: 'seed-sn1' },
      { name: 'Yuto T', role: 'Big Air', teamId: 'seed-sn2' },
    ],
    matches: [
      { id: 'seed-snm-live', t1: 'seed-sn1', t2: 'seed-sn2', status: 'live', venue: 'Aspen Halfpipe', matchType: 'Halfpipe', score1: '90 pts', score2: '80 pts',
        events: [...rep('seed-sn1','run-score-90',1,1,90), ...rep('seed-sn1','run-score-80',2,1,80), ...rep('seed-sn2','run-score-80',1,1,80), ...rep('seed-sn2','run-score-70',2,1,70)] },
      { id: 'seed-snm-done', t1: 'seed-sn1', t2: 'seed-sn2', status: 'completed', venue: 'Sapporo Park', matchType: 'Halfpipe', score1: '90 pts', score2: '70 pts', result: 'Chloe K won — best run 90',
        events: [...rep('seed-sn1','run-score-90',1,1,90), ...rep('seed-sn2','run-score-70',1,1,70), ...rep('seed-sn2','crash',2,1,0)] },
    ],
    posts: [
      { authorName: 'Chloe K', text: 'Stomped a 90 on the first run! 🏂', likes: 28 },
      { authorName: 'Chloe K', text: 'Best run of 90 holds up for the win. Stoked! ❄️', likes: 39 },
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
      if (!existing) await prisma.player.create({ data: { name: p.name, role: p.role, sport: sp.id, teamId: p.teamId, stats: { events: 30, wins: 18 } } });
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
  console.log('Individual seed done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
