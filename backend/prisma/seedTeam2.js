// Seed the remaining team sports (volleyball, handball, kho-kho) to parity:
// team-vs-team matches with real sport-events so score + /sport-stats compute, plus
// posts. Events tuned so computeSportScore matches stored score1/score2. Idempotent.
//   node prisma/seedTeam2.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// repeat an event n times → array of [teamKey, type, periodNum, value] tuples
const rep = (team, type, periodNum, n, value = 1) =>
  Array.from({ length: n }, () => [team, type, periodNum, value]);

const SPORTS = [
  {
    id: 'volleyball', period: 'set',
    teams: [
      { id: 'seed-vb1', name: 'Smashers VC', city: 'Chennai' },
      { id: 'seed-vb2', name: 'Spike Force', city: 'Bengaluru' },
    ],
    players: [
      { name: 'Karthik V', role: 'Spiker', teamId: 'seed-vb1' },
      { name: 'Amit R', role: 'Setter', teamId: 'seed-vb1' },
      { name: 'Liang H', role: 'Libero', teamId: 'seed-vb2' },
    ],
    matches: [
      { id: 'seed-vbm-live', t1: 'seed-vb1', t2: 'seed-vb2', status: 'live', venue: 'Beach Dome, Chennai', matchType: 'Best of 5', score1: '2', score2: '1',
        events: [...rep('seed-vb1','set-win',1,1), ...rep('seed-vb1','set-win',2,1), ...rep('seed-vb2','set-win',3,1),
                 ...rep('seed-vb1','ace',1,3), ...rep('seed-vb2','ace',2,2), ...rep('seed-vb1','block',2,2), ...rep('seed-vb2','block',3,1)] },
      { id: 'seed-vbm-done', t1: 'seed-vb1', t2: 'seed-vb2', status: 'completed', venue: 'Spike Court, Bengaluru', matchType: 'Best of 5', score1: '3', score2: '1', result: 'Smashers VC won 3–1',
        events: [...rep('seed-vb1','set-win',1,1), ...rep('seed-vb2','set-win',2,1), ...rep('seed-vb1','set-win',3,1), ...rep('seed-vb1','set-win',4,1),
                 ...rep('seed-vb1','ace',1,4), ...rep('seed-vb2','ace',2,2), ...rep('seed-vb1','block',3,3)] },
    ],
    posts: [
      { authorName: 'Karthik V', text: 'Two sets to one — service aces are flowing! 🏐', likes: 21 },
      { authorName: 'Smashers VC', text: 'Closed it out 3-1. Block wall was unreal tonight.', likes: 30 },
    ],
  },
  {
    id: 'handball', period: 'half',
    teams: [
      { id: 'seed-hb1', name: 'Coastal HC',     city: 'Kochi' },
      { id: 'seed-hb2', name: 'Metro Handball', city: 'Delhi' },
    ],
    players: [
      { name: 'Niko P',  role: 'Pivot',      teamId: 'seed-hb1' },
      { name: 'Sven L',  role: 'Back',       teamId: 'seed-hb1' },
      { name: 'Omar Z',  role: 'Goalkeeper', teamId: 'seed-hb2' },
    ],
    matches: [
      { id: 'seed-hbm-live', t1: 'seed-hb1', t2: 'seed-hb2', status: 'live', venue: 'Marina Indoor, Kochi', matchType: 'Full Match', score1: '9', score2: '7',
        events: [...rep('seed-hb1','goal',1,9), ...rep('seed-hb2','goal',1,7), ...rep('seed-hb1','7m-throw',1,1), ...rep('seed-hb2','7m-throw',2,2), ...rep('seed-hb2','yellow-card',2,1)] },
      { id: 'seed-hbm-done', t1: 'seed-hb1', t2: 'seed-hb2', status: 'completed', venue: 'Metro Hall, Delhi', matchType: 'Full Match', score1: '11', score2: '9', result: 'Coastal HC won 11–9',
        events: [...rep('seed-hb1','goal',1,11), ...rep('seed-hb2','goal',1,9), ...rep('seed-hb1','7m-throw',2,2), ...rep('seed-hb2','7m-throw',2,1), ...rep('seed-hb1','yellow-card',2,1)] },
    ],
    posts: [
      { authorName: 'Niko P', text: 'Pivot play clicking — 9-7 up at the half! 🤾', likes: 16 },
      { authorName: 'Coastal HC', text: '11-9 win. Goalkeeper stood tall in the last five minutes.', likes: 22 },
    ],
  },
  {
    id: 'khokho', period: 'turn',
    teams: [
      { id: 'seed-kk1', name: 'Maratha Chasers', city: 'Pune' },
      { id: 'seed-kk2', name: 'Deccan Runners',  city: 'Hyderabad' },
    ],
    players: [
      { name: 'Sachin G', role: 'Chaser',   teamId: 'seed-kk1' },
      { name: 'Pooja D',  role: 'Runner',   teamId: 'seed-kk1' },
      { name: 'Imran S',  role: 'Defender', teamId: 'seed-kk2' },
    ],
    matches: [
      { id: 'seed-kkm-live', t1: 'seed-kk1', t2: 'seed-kk2', status: 'live', venue: 'Chase Ground, Pune', matchType: 'Standard', score1: '5', score2: '3',
        events: [...rep('seed-kk1','out',1,5), ...rep('seed-kk2','out',2,3), ...rep('seed-kk1','bonus',1,1)] },
      { id: 'seed-kkm-done', t1: 'seed-kk1', t2: 'seed-kk2', status: 'completed', venue: 'Runners Maidan, Hyderabad', matchType: 'Standard', score1: '9', score2: '7', result: 'Maratha Chasers won 9–7',
        events: [...rep('seed-kk1','out',1,9), ...rep('seed-kk2','out',2,7), ...rep('seed-kk1','bonus',3,1), ...rep('seed-kk2','bonus',4,1)] },
    ],
    posts: [
      { authorName: 'Sachin G', text: 'Quick chains on the chase — 5-3 in front! 🏃', likes: 14 },
      { authorName: 'Maratha Chasers', text: '9-7 win. Pole turns were lightning today.', likes: 19 },
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
      if (!existing) await prisma.player.create({ data: { name: p.name, role: p.role, sport: sp.id, teamId: p.teamId, stats: { matches: 50, wins: 28 } } });
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
  console.log('Team-2 seed done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
