// Seed data for the search/Explore flow: "Looking for" posts across sports,
// plus a few non-cricket tournaments and grounds. Idempotent — safe to re-run.
//
//   node prisma/seedSearch.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOOKING_FOR = [
  // cricket
  { sport: 'cricket', type: 'player',  title: 'Sunday Strikers need a fast bowler', location: 'Chennai',   format: 'T20' },
  { sport: 'cricket', type: 'umpire',  title: 'Umpire needed for weekend tournament', location: 'Chennai', format: 'T20' },
  { sport: 'cricket', type: 'team',    title: 'All-rounder looking for a club team', location: 'Bengaluru', format: 'All' },
  { sport: 'cricket', type: 'scorer',  title: 'Scorer wanted for league matches',    location: 'Mumbai',    format: 'ODI' },
  // football
  { sport: 'football', type: 'player', title: 'Chennai City FC needs a striker',      location: 'Chennai',   format: 'League' },
  { sport: 'football', type: 'umpire', title: 'Referee wanted for Sunday league',     location: 'Bengaluru', format: 'League' },
  { sport: 'football', type: 'team',   title: 'Goalkeeper looking for a team',        location: 'Pune',      format: 'Friendly' },
  // badminton
  { sport: 'badminton', type: 'player', title: 'Doubles partner wanted (intermediate)', location: 'Hyderabad', format: 'Doubles' },
  { sport: 'badminton', type: 'coach',  title: 'Coach available for singles training',  location: 'Chennai',   format: 'Singles' },
];

const TOURNAMENTS = [
  { id: 'seed-tn-fb1', sport: 'football',  name: 'Chennai Super League',   format: 'League', status: 'ongoing',  venue: 'Marina Arena',     organizer: 'CSL Org' },
  { id: 'seed-tn-fb2', sport: 'football',  name: 'Bengaluru Cup',          format: 'Knockout', status: 'upcoming', venue: 'Rovers Ground',  organizer: 'BFA' },
  { id: 'seed-tn-bd1', sport: 'badminton', name: 'Smash Open 2026',        format: 'Singles', status: 'upcoming', venue: 'Indoor Hall A',  organizer: 'Smash Masters' },
];

const GROUNDS = [
  { id: 'seed-gr-fb1', sport: 'football',  name: 'Marina Football Arena', location: 'Chennai',   price: 1200, facilities: ['Floodlights', 'Turf', 'Changing rooms'] },
  { id: 'seed-gr-fb2', sport: 'football',  name: 'Rovers Turf',           location: 'Bengaluru', price: 1000, facilities: ['Floodlights', 'Turf'] },
  { id: 'seed-gr-bd1', sport: 'badminton', name: 'Indoor Shuttle Hall',   location: 'Hyderabad', price: 400,  facilities: ['Wooden courts', 'AC'] },
];

async function main() {
  // Looking-for posts (dedupe by title).
  let lf = 0;
  for (const p of LOOKING_FOR) {
    const existing = await prisma.lookingFor.findFirst({ where: { title: p.title } });
    if (existing) await prisma.lookingFor.update({ where: { id: existing.id }, data: p });
    else { await prisma.lookingFor.create({ data: p }); lf++; }
  }

  for (const t of TOURNAMENTS) {
    await prisma.tournament.upsert({ where: { id: t.id }, update: t, create: t });
  }
  for (const g of GROUNDS) {
    await prisma.ground.upsert({ where: { id: g.id }, update: g, create: g });
  }

  const lfBySport = await prisma.lookingFor.groupBy({ by: ['sport'], _count: true });
  console.log('looking-for by sport:', lfBySport.map(x => `${x.sport}:${x._count}`).join('  '));
  console.log('tournaments:', await prisma.tournament.count(), ' grounds:', await prisma.ground.count());
  console.log(`Done. +${lf} new looking-for posts.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
