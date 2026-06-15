// Seed representative data for the remaining picker sports so every sport is
// demoable: 2 clubs + 6 players + 2 matches + 1 tournament + 1 ground each.
// Idempotent. Run:  node prisma/seedAllSports.js

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// sport id → { roles, teamA, teamB, scoreA, scoreB, unit }
const SPORTS = {
  kabaddi:    { roles: ['Raider', 'Defender', 'All-rounder'], a: 'Chennai Chargers',  b: 'Deccan Raiders',   sa: '38', sb: '34' },
  hockey:     { roles: ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'], a: 'Coastal Strikers', b: 'Highland HC', sa: '3', sb: '2' },
  tennis:     { roles: ['Singles', 'Doubles'], a: 'Baseline Club',   b: 'Ace Academy',     sa: '6-4 6-3', sb: '' },
  basketball: { roles: ['Guard', 'Forward', 'Center'], a: 'Metro Hoops', b: 'City Dunkers', sa: '88', sb: '81' },
  volleyball: { roles: ['Setter', 'Spiker', 'Libero'], a: 'Beach Spikers', b: 'Net Kings', sa: '3', sb: '1' },
  boxing:     { roles: ['Boxer'], a: 'Iron Gym',        b: 'Knockout Club',   sa: 'W', sb: 'L' },
  wrestling:  { roles: ['Wrestler'], a: 'Akhada A',     b: 'Akhada B',        sa: 'W', sb: 'L' },
  khokho:     { roles: ['Attacker', 'Defender'], a: 'Swift Chasers', b: 'Rapid Runners', sa: '26', sb: '22' },
  handball:   { roles: ['Goalkeeper', 'Wing', 'Pivot'], a: 'Harbour HC', b: 'Valley Handball', sa: '28', sb: '25' },
  squash:     { roles: ['Singles'], a: 'Glass Court Club', b: 'Rally Squash', sa: '3', sb: '1' },
  pickleball: { roles: ['Singles', 'Doubles'], a: 'Dink Masters', b: 'Paddle Pros', sa: '11-7', sb: '' },
  judo:       { roles: ['Judoka'], a: 'Dojo Tigers',   b: 'Belt & Mat',      sa: 'Ippon', sb: '' },
  karate:     { roles: ['Karateka'], a: 'Shotokan Club', b: 'Kata Masters',  sa: 'W', sb: 'L' },
  golf:       { roles: ['Golfer'], a: 'Greens Club',   b: 'Fairway Society', sa: '-4', sb: '-1' },
  archery:    { roles: ['Archer'], a: 'Bullseye Club', b: 'Target Range',    sa: '648', sb: '641' },
  bowling:    { roles: ['Bowler'], a: 'Strike Lanes',  b: 'Pin Kings',       sa: '212', sb: '198' },
  snowboard:  { roles: ['Rider'],  a: 'Powder Crew',   b: 'Alpine Riders',   sa: '92.5', sb: '88.0' },
};

const FIRST = ['Arjun', 'Rohan', 'Priya', 'Kabir', 'Dev', 'Isha', 'Vikram', 'Sana', 'Neha', 'Rahul', 'Meera', 'Sameer', 'Tara', 'Karan', 'Anya', 'Vivek'];
const LAST  = ['Sharma', 'Nair', 'Patel', 'Singh', 'Rao', 'Khan', 'Iyer', 'Dixit', 'Joshi', 'Menon', 'Gupta', 'Reddy'];
const CITIES = ['Chennai', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi'];

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const pick = (arr, h) => arr[h % arr.length];

async function main() {
  let teams = 0, players = 0, matches = 0;
  for (const [sport, cfg] of Object.entries(SPORTS)) {
    // 2 clubs
    const t1 = await prisma.team.upsert({ where: { id: `seed-${sport}-a` }, update: { name: cfg.a, sport }, create: { id: `seed-${sport}-a`, name: cfg.a, city: pick(CITIES, hash(sport)), sport } });
    const t2 = await prisma.team.upsert({ where: { id: `seed-${sport}-b` }, update: { name: cfg.b, sport }, create: { id: `seed-${sport}-b`, name: cfg.b, city: pick(CITIES, hash(sport + 'b')), sport } });
    teams += 2;

    // 6 players (3 per club)
    for (let i = 0; i < 6; i++) {
      const h = hash(`${sport}${i}`);
      const name = `${pick(FIRST, h)} ${pick(LAST, h >> 3)}`;
      const role = cfg.roles[i % cfg.roles.length];
      const teamId = i < 3 ? t1.id : t2.id;
      const stats = { matches: 30 + (h % 130), style: role, points: 100 + (h % 1500) };
      const existing = await prisma.player.findFirst({ where: { name, teamId, sport } });
      if (existing) await prisma.player.update({ where: { id: existing.id }, data: { role, sport, stats } });
      else { await prisma.player.create({ data: { name, role, sport, teamId, stats } }); players++; }
    }

    // 2 matches (1 completed, 1 live)
    const mDefs = [
      { status: 'completed', score1: cfg.sa, score2: cfg.sb, result: `${cfg.a} won`, venue: `${cfg.a} Arena` },
      { status: 'live',      score1: cfg.sa, score2: cfg.sb, result: null,            venue: `${cfg.b} Ground` },
    ];
    for (const m of mDefs) {
      const found = await prisma.match.findFirst({ where: { sport, venue: m.venue } });
      if (!found) {
        await prisma.match.create({ data: { team1Id: t1.id, team2Id: t2.id, sport, matchType: 'League', ...m } });
        matches++;
      }
    }

    // 1 tournament + 1 ground
    await prisma.tournament.upsert({ where: { id: `seed-tn-${sport}` }, update: { sport }, create: { id: `seed-tn-${sport}`, sport, name: `${cfg.a} ${sport[0].toUpperCase() + sport.slice(1)} Cup`, format: 'League', status: 'upcoming', venue: `${cfg.a} Arena` } });
    await prisma.ground.upsert({ where: { id: `seed-gr-${sport}` }, update: { sport }, create: { id: `seed-gr-${sport}`, sport, name: `${pick(CITIES, hash(sport))} ${sport[0].toUpperCase() + sport.slice(1)} Center`, location: pick(CITIES, hash(sport)), price: 300 + (hash(sport) % 900) } });
  }
  const bySport = await prisma.player.groupBy({ by: ['sport'], _count: true });
  console.log('players by sport:', bySport.map(s => `${s.sport}:${s._count}`).join(' '));
  console.log(`+${teams} teams, +${players} players, +${matches} matches across ${Object.keys(SPORTS).length} sports`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
