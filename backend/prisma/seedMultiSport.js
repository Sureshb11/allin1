// Seed a few non-cricket teams + players so the multi-sport filters
// (/players?sport=football etc.) return real data. Idempotent — safe to re-run.
//
//   node prisma/seedMultiSport.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEAMS = [
  { id: 'seed-fc1', name: 'Chennai City FC',    city: 'Chennai',   sport: 'football' },
  { id: 'seed-fc2', name: 'Bengaluru Rovers',   city: 'Bengaluru', sport: 'football' },
  { id: 'seed-bd1', name: 'Smash Masters Club', city: 'Hyderabad', sport: 'badminton' },
  { id: 'seed-bd2', name: 'Rally Kings Club',   city: 'Chennai',   sport: 'badminton' },
];

const PLAYERS = [
  // Football
  { name: 'Diego Fernandes', role: 'Striker',     sport: 'football', teamId: 'seed-fc1', stats: { matches: 88, goals: 61, assists: 22, style: 'Right foot · Forward' } },
  { name: 'Arjun Pillai',    role: 'Midfielder',  sport: 'football', teamId: 'seed-fc1', stats: { matches: 102, goals: 18, assists: 47, style: 'Box-to-box' } },
  { name: 'Marco Silva',     role: 'Defender',    sport: 'football', teamId: 'seed-fc1', stats: { matches: 110, goals: 6, assists: 9, style: 'Centre-back' } },
  { name: 'Kenji Watanabe',  role: 'Goalkeeper',  sport: 'football', teamId: 'seed-fc2', stats: { matches: 95, cleanSheets: 38, saves: 410, style: 'Shot-stopper' } },
  { name: 'Rahul Nair',      role: 'Striker',     sport: 'football', teamId: 'seed-fc2', stats: { matches: 74, goals: 44, assists: 15, style: 'Left foot · Forward' } },
  { name: 'Sergio Mendez',   role: 'Midfielder',  sport: 'football', teamId: 'seed-fc2', stats: { matches: 130, goals: 25, assists: 53, style: 'Playmaker' } },
  // Badminton (individual sport)
  { name: 'Anaya Reddy',     role: 'Singles',     sport: 'badminton', teamId: 'seed-bd1', stats: { matches: 156, wins: 112, titles: 9, style: 'Attacking singles' } },
  { name: 'Vikram Joshi',    role: 'Singles',     sport: 'badminton', teamId: 'seed-bd1', stats: { matches: 140, wins: 88, titles: 5, style: 'Defensive singles' } },
  { name: 'Leela & Tan',     role: 'Doubles',     sport: 'badminton', teamId: 'seed-bd1', stats: { matches: 98, wins: 70, titles: 6, style: 'Mixed doubles' } },
];

async function main() {
  for (const t of TEAMS) {
    await prisma.team.upsert({
      where: { id: t.id },
      update: { name: t.name, city: t.city, sport: t.sport },
      create: t,
    });
  }
  let created = 0;
  for (const p of PLAYERS) {
    const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
    if (existing) {
      await prisma.player.update({ where: { id: existing.id }, data: { role: p.role, sport: p.sport, stats: p.stats } });
    } else {
      await prisma.player.create({ data: p });
      created++;
    }
    console.log(`✓ ${p.sport.padEnd(9)} ${p.name} (${p.role})`);
  }
  // ── Matches (live + completed) so Scores/Live populate per sport ──
  const MATCHES = [
    { team1Id: 'seed-fc1', team2Id: 'seed-fc2', sport: 'football', status: 'live',      venue: 'Marina Arena, Chennai',    matchType: 'League',  score1: '2', score2: '1' },
    { team1Id: 'seed-fc2', team2Id: 'seed-fc1', sport: 'football', status: 'completed', venue: 'Rovers Park, Bengaluru',    matchType: 'League',  score1: '0', score2: '3', result: 'Chennai City FC won 3–0' },
    { team1Id: 'seed-bd1', team2Id: 'seed-bd2', sport: 'badminton', status: 'live',     venue: 'Indoor Shuttle Hall',      matchType: 'Singles', score1: '1', score2: '1' },
  ];
  for (const m of MATCHES) {
    const existing = await prisma.match.findFirst({ where: { venue: m.venue, sport: m.sport } });
    if (!existing) await prisma.match.create({ data: m });
  }

  // ── Tournaments per sport ──
  const TOURNAMENTS = [
    { name: 'City Football Cup', sport: 'football',  format: '11-a-side', status: 'ongoing',  venue: 'Chennai',   prizePool: '₹1,00,000', organizer: 'Local Legends' },
    { name: 'Smash Open',        sport: 'badminton', format: 'Singles',   status: 'upcoming', venue: 'Hyderabad', prizePool: '₹50,000',   organizer: 'Smash Masters' },
  ];
  for (const t of TOURNAMENTS) {
    const existing = await prisma.tournament.findFirst({ where: { name: t.name } });
    if (!existing) await prisma.tournament.create({ data: t });
  }

  // ── Grounds per sport ──
  const GROUNDS = [
    { name: 'Marina Football Arena', location: 'Chennai',   price: 1500, sport: 'football',  facilities: ['Floodlights', 'Turf', 'Changing rooms'] },
    { name: 'Indoor Shuttle Hall',   location: 'Hyderabad', price: 600,  sport: 'badminton', facilities: ['Wooden courts', 'AC', 'Seating'] },
  ];
  for (const g of GROUNDS) {
    const existing = await prisma.ground.findFirst({ where: { name: g.name } });
    if (!existing) await prisma.ground.create({ data: g });
  }

  const counts = await prisma.player.groupBy({ by: ['sport'], _count: true });
  console.log('\nPlayers by sport:', counts.map(c => `${c.sport}:${c._count}`).join('  '));
  const mc = await prisma.match.groupBy({ by: ['sport'], _count: true });
  console.log('Matches by sport:', mc.map(c => `${c.sport}:${c._count}`).join('  '));
  console.log(`Done. Created ${created} new players.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
