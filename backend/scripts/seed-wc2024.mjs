#!/usr/bin/env node
// Seed the 2024 ICC Men's T20 World Cup as sample tournament data.
//
//   node scripts/seed-wc2024.mjs            # create
//   node scripts/seed-wc2024.mjs --undo     # remove exactly what it created
//   node scripts/seed-wc2024.mjs --dry-run  # print the plan, write nothing
//
// THIS WRITES TO NEON. There is no local database (see CLAUDE.md), so running
// it is a production write. Everything it creates is tagged so --undo can find
// it again: the tournament carries flags.seed = SEED_TAG, and every Team it
// makes carries the same tag in `bio`. Nothing pre-existing is touched — teams
// are looked up by that tag, not by name, so a real "India" team in the
// database is neither reused nor modified.
//
// ── On the accuracy of this data ────────────────────────────────────────────
// The STRUCTURE and OUTCOMES are the real tournament: all 20 teams in their
// real groups, the real win/loss/no-result of every group fixture, the real
// Super 8 line-ups and results, the real semi-finalists, and the real final
// (India 176/7 beat South Africa 169/8 by 7 runs). So the points tables,
// qualification and bracket are what actually happened.
//
// Individual SCORELINES are illustrative except where marked `real: true`.
// They're generated to be internally consistent — Net Run Rate is computed
// from the scores stored here, so the table adds up — but don't cite them.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEED_TAG = 'sample:wc2024';
const UNDO = process.argv.includes('--undo');
const DRY = process.argv.includes('--dry-run');

/* ── Teams, by group ───────────────────────────────────────────────────────
   Group letters are the real first-round groups. */
const GROUPS = {
  A: ['India', 'United States', 'Pakistan', 'Canada', 'Ireland'],
  B: ['Australia', 'England', 'Scotland', 'Namibia', 'Oman'],
  C: ['Afghanistan', 'West Indies', 'New Zealand', 'Uganda', 'Papua New Guinea'],
  D: ['South Africa', 'Bangladesh', 'Netherlands', 'Sri Lanka', 'Nepal'],
};
const CITY = {
  India: 'Mumbai', 'United States': 'Dallas', Pakistan: 'Lahore', Canada: 'Toronto',
  Ireland: 'Dublin', Australia: 'Melbourne', England: 'London', Scotland: 'Edinburgh',
  Namibia: 'Windhoek', Oman: 'Muscat', Afghanistan: 'Kabul', 'West Indies': 'Bridgetown',
  'New Zealand': 'Auckland', Uganda: 'Kampala', 'Papua New Guinea': 'Port Moresby',
  'South Africa': 'Johannesburg', Bangladesh: 'Dhaka', Netherlands: 'Amsterdam',
  'Sri Lanka': 'Colombo', Nepal: 'Kathmandu',
};

// Venues actually used in 2024 (USA + West Indies).
const VENUES = [
  'Nassau County International Cricket Stadium, New York',
  'Grand Prairie Stadium, Dallas',
  'Central Broward Park, Lauderhill',
  'Kensington Oval, Bridgetown',
  'Providence Stadium, Guyana',
  'Sir Vivian Richards Stadium, Antigua',
  'Daren Sammy Stadium, St Lucia',
  'Arnos Vale Ground, St Vincent',
];

/* ── Results ───────────────────────────────────────────────────────────────
   [home, away, winner | null for no-result]. Real outcomes; see header. */
const GROUP_RESULTS = [
  // Group A — India 7, United States 5, Pakistan 4, Canada 3, Ireland 1
  ['United States', 'Canada', 'United States'],
  ['India', 'Ireland', 'India'],
  ['Pakistan', 'United States', 'United States'],   // decided by a super over
  ['Canada', 'Ireland', 'Canada'],
  ['India', 'Pakistan', 'India'],                   // real: India 119, Pakistan 113/7
  ['United States', 'India', 'India'],
  ['Pakistan', 'Canada', 'Pakistan'],
  ['Ireland', 'Pakistan', 'Pakistan'],
  ['United States', 'Ireland', null],               // washed out
  ['Canada', 'India', null],                        // washed out

  // Group B — Australia 8, England 5, Scotland 5, Namibia 2, Oman 0
  ['Namibia', 'Oman', 'Namibia'],                   // decided by a super over
  ['Scotland', 'England', null],                    // washed out
  ['Australia', 'Oman', 'Australia'],
  ['Scotland', 'Namibia', 'Scotland'],
  ['England', 'Oman', 'England'],
  ['Australia', 'England', 'Australia'],
  ['Scotland', 'Oman', 'Scotland'],
  ['Australia', 'Namibia', 'Australia'],
  ['England', 'Namibia', 'England'],
  ['Australia', 'Scotland', 'Australia'],

  // Group C — Afghanistan 8, West Indies 6, New Zealand 4, Uganda 2, PNG 0
  ['West Indies', 'Papua New Guinea', 'West Indies'],
  ['Afghanistan', 'Uganda', 'Afghanistan'],
  ['New Zealand', 'Afghanistan', 'Afghanistan'],
  ['Uganda', 'Papua New Guinea', 'Uganda'],
  ['West Indies', 'Uganda', 'West Indies'],
  ['Afghanistan', 'Papua New Guinea', 'Afghanistan'],
  ['West Indies', 'New Zealand', 'West Indies'],
  ['New Zealand', 'Uganda', 'New Zealand'],
  ['Afghanistan', 'West Indies', 'Afghanistan'],
  ['New Zealand', 'Papua New Guinea', 'New Zealand'],

  // Group D — South Africa 8, Bangladesh 6, Netherlands 4, Sri Lanka 2, Nepal 0
  ['Sri Lanka', 'South Africa', 'South Africa'],
  ['Netherlands', 'Nepal', 'Netherlands'],
  ['South Africa', 'Netherlands', 'South Africa'],
  ['Bangladesh', 'Sri Lanka', 'Bangladesh'],
  ['South Africa', 'Bangladesh', 'South Africa'],
  ['Netherlands', 'Sri Lanka', 'Netherlands'],
  ['Bangladesh', 'Netherlands', 'Bangladesh'],
  ['Sri Lanka', 'Nepal', 'Sri Lanka'],              // won by 1 run
  ['South Africa', 'Nepal', 'South Africa'],
  ['Bangladesh', 'Nepal', 'Bangladesh'],
];

// Super 8: two groups of four. India + Afghanistan and South Africa + England
// went through.
const SUPER8 = {
  1: ['India', 'Australia', 'Afghanistan', 'Bangladesh'],
  2: ['South Africa', 'England', 'West Indies', 'United States'],
};
const SUPER8_RESULTS = [
  ['United States', 'South Africa', 'South Africa'],
  ['England', 'West Indies', 'England'],
  ['India', 'Afghanistan', 'India'],
  ['Australia', 'Bangladesh', 'Australia'],
  ['England', 'South Africa', 'South Africa'],
  ['West Indies', 'United States', 'West Indies'],
  ['India', 'Bangladesh', 'India'],
  ['Afghanistan', 'Australia', 'Afghanistan'],
  ['United States', 'England', 'England'],
  ['West Indies', 'South Africa', 'South Africa'],
  ['Australia', 'India', 'India'],
  ['Afghanistan', 'Bangladesh', 'Afghanistan'],
];

// The three matches whose scores are the real ones.
const KNOCKOUT = [
  { round: 'Semi-Final 1', a: 'South Africa', b: 'Afghanistan', winner: 'South Africa',
    sa: 60, sb: 56, oa: 8.5, ob: 11.5, result: 'South Africa won by 9 wickets', real: true },
  { round: 'Semi-Final 2', a: 'India', b: 'England', winner: 'India',
    sa: 171, sb: 103, oa: 20, ob: 16.4, result: 'India won by 68 runs', real: true },
  { round: 'Final', a: 'India', b: 'South Africa', winner: 'India',
    sa: 176, sb: 169, oa: 20, ob: 20, result: 'India won by 7 runs', real: true },
];

/* ── Illustrative scorelines ───────────────────────────────────────────────
   Deterministic from the fixture, so re-running produces the same table. A
   winner posts 150-190 and concedes 15-45 fewer; a no-result stores nothing. */
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const scoreFor = (a, b, winner) => {
  const h = hash(a + b);
  const win = 150 + (h % 41);            // 150-190
  const margin = 15 + ((h >> 5) % 31);   // 15-45
  const lose = win - margin;
  const chased = (h >> 3) % 2 === 0;     // did the winner bat second?
  return winner === a
    ? { sa: win, sb: lose, oa: chased ? 17 + ((h >> 7) % 3) : 20, ob: 20 }
    : { sa: lose, sb: win, oa: 20, ob: chased ? 17 + ((h >> 7) % 3) : 20 };
};

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2024-06-01T14:00:00.000Z');

async function undo() {
  const tourneys = await prisma.tournament.findMany({ where: { name: { contains: 'T20 World Cup 2024' } } });
  const mine = tourneys.filter((t) => t.flags?.seed === SEED_TAG);
  if (!mine.length) { console.log('Nothing tagged', SEED_TAG, '— nothing to undo.'); return; }
  for (const t of mine) {
    const m = await prisma.tournamentMatch.deleteMany({ where: { tournamentId: t.id } });
    const tt = await prisma.tournamentTeam.deleteMany({ where: { tournamentId: t.id } });
    const ph = await prisma.tournamentPhase.deleteMany({ where: { tournamentId: t.id } });
    await prisma.tournament.delete({ where: { id: t.id } });
    console.log(`✓ removed "${t.name}" — ${m.count} fixtures, ${tt.count} entries, ${ph.count} phases`);
  }
  const teams = await prisma.team.deleteMany({ where: { bio: SEED_TAG } });
  console.log(`✓ removed ${teams.count} sample teams`);
}

async function seed() {
  const existing = await prisma.tournament.findFirst({
    where: { name: { contains: 'T20 World Cup 2024' } },
  });
  if (existing) {
    console.log(`Already present: "${existing.name}" (${existing.id}). Run with --undo first.`);
    return;
  }

  const names = Object.values(GROUPS).flat();
  console.log(`Plan: 1 tournament, ${names.length} teams, ` +
    `${GROUP_RESULTS.length + SUPER8_RESULTS.length + KNOCKOUT.length} fixtures, 6 phases.`);
  if (DRY) return;

  // Teams — created fresh and tagged, never matched against existing rows.
  const team = {};
  for (const name of names) {
    team[name] = await prisma.team.create({
      data: { name, city: CITY[name] || null, country: name, sport: 'cricket', bio: SEED_TAG },
    });
  }

  const tournament = await prisma.tournament.create({
    data: {
      name: "ICC Men's T20 World Cup 2024",
      shortName: 'T20WC24',
      format: 'T20',
      category: 'League + Knockout',
      status: 'completed',
      overs: 20,
      ballType: 'Leather',
      sport: 'cricket',
      venue: 'West Indies & United States',
      city: 'Bridgetown',
      maxTeams: 20,
      prizePool: '2450000',
      organizer: 'International Cricket Council',
      description:
        'The ninth ICC Men\'s T20 World Cup, co-hosted by the West Indies and the United States. ' +
        'Twenty teams, four groups, a Super 8 stage, and a final India won by 7 runs. ' +
        'Sample data — match scorelines are illustrative outside the knockouts.',
      startDate: START,
      endDate: new Date(START.getTime() + 28 * DAY),
      location: { ground: 'Kensington Oval', state: 'Barbados', country: 'West Indies' },
      registration: {
        minTeams: 20, maxPlayers: 15, minPlayers: 11, playingXi: 11, substitutes: 4,
        entryFee: 0, currency: 'USD', type: 'invite',
      },
      rules: {
        wide: true, noBall: true, freeHit: true, legBye: true, bye: true,
        dls: true, superOver: true, powerplay: true, penaltyRuns: true,
        powerplayOvers: 6, maxOversPerBowler: 4,
      },
      pointsRules: { win: 2, tie: 1, noResult: 1, loss: 0, bonus: false,
        tieBreak: ['points', 'nrr', 'h2h', 'wins', 'boundaries'] },
      prizes: { winner: '2450000', runnerUp: '1280000', semiFinal: '787500' },
      flags: { visibility: 'public', liveScore: false, teamRegistration: false, spectators: true, seed: SEED_TAG },
    },
  });
  console.log(`✓ tournament ${tournament.id}`);

  // Phases, in playing order.
  const phase = {};
  const PHASES = [
    ['Group A', 'group'], ['Group B', 'group'], ['Group C', 'group'], ['Group D', 'group'],
    ['Super 8', 'group'], ['Knockout', 'knockout'],
  ];
  for (const [i, [name, type]] of PHASES.entries()) {
    phase[name] = await prisma.tournamentPhase.create({
      data: { tournamentId: tournament.id, order: i, name, type },
    });
  }

  // Entries. Points/played/won come out of the fixtures below, so they're
  // filled in at the end rather than typed twice.
  const entry = {};
  for (const [g, members] of Object.entries(GROUPS)) {
    for (const name of members) {
      entry[name] = await prisma.tournamentTeam.create({
        data: { tournamentId: tournament.id, teamId: team[name].id, group: g, status: 'approved' },
      });
    }
  }

  const tally = Object.fromEntries(names.map((n) => [n, { played: 0, won: 0, lost: 0, tied: 0, points: 0, rf: 0, of: 0, ra: 0, ob: 0 }]));
  let day = 0;

  // `counts` = does this fixture feed the points table? Only the first-round
  // groups do. TournamentTeam holds ONE points row per team next to ONE group
  // letter, so it can only describe one table — and the letter says which:
  // Group A-D. Folding the Super 8 and the knockouts into the same row gave
  // India 17 points in "Group A", which is not a table anyone would recognise.
  // Those fixtures are still created; they're just not group-stage points.
  const addMatch = async (a, b, winner, { round, phaseName, sa, sb, oa, ob, result, counts = true }) => {
    const noResult = winner === null;
    const stats = noResult ? null : {
      [team[a].id]: { scored: sa, conceded: sb, oversFaced: oa, oversBowled: ob },
      [team[b].id]: { scored: sb, conceded: sa, oversFaced: ob, oversBowled: oa },
    };
    await prisma.tournamentMatch.create({
      data: {
        tournamentId: tournament.id,
        phaseId: phase[phaseName].id,
        team1Id: team[a].id,
        team2Id: team[b].id,
        scheduledAt: new Date(START.getTime() + day++ * DAY / 2),
        venue: VENUES[hash(a + b) % VENUES.length],
        round,
        status: 'completed',
        result: result || (noResult ? 'No result — rain' : `${winner} won`),
        resultKind: noResult ? 'noResult' : 'win',   // the engine's spelling — see ResultSchema
        winnerTeamId: noResult ? null : team[winner].id,
        resultStats: stats,
      },
    });
    // Standings. A no-result is a point each and no NRR contribution — an
    // abandoned game must not drag a run rate it never produced.
    if (!counts) return;
    for (const [n, mine, theirs, myOv, theirOv] of [[a, sa, sb, oa, ob], [b, sb, sa, ob, oa]]) {
      const t = tally[n];
      t.played += 1;
      if (noResult) { t.tied += 1; t.points += 1; continue; }
      t.rf += mine; t.of += myOv; t.ra += theirs; t.ob += theirOv;
      if (n === winner) { t.won += 1; t.points += 2; } else t.lost += 1;
    }
  };

  for (const [a, b, winner] of GROUP_RESULTS) {
    const g = Object.entries(GROUPS).find(([, m]) => m.includes(a))[0];
    const s = winner ? scoreFor(a, b, winner) : {};
    await addMatch(a, b, winner, { round: `Group ${g}`, phaseName: `Group ${g}`, ...s });
  }
  for (const [a, b, winner] of SUPER8_RESULTS) {
    const g = Object.entries(SUPER8).find(([, m]) => m.includes(a))[0];
    await addMatch(a, b, winner, { round: `Super 8 Group ${g}`, phaseName: 'Super 8', counts: false, ...scoreFor(a, b, winner) });
  }
  for (const k of KNOCKOUT) {
    await addMatch(k.a, k.b, k.winner, { round: k.round, phaseName: 'Knockout', counts: false, ...k });
  }

  // Write the aggregates back onto each entry.
  for (const name of names) {
    const t = tally[name];
    const nrr = +(((t.of ? t.rf / t.of : 0) - (t.ob ? t.ra / t.ob : 0)).toFixed(3));
    await prisma.tournamentTeam.update({
      where: { id: entry[name].id },
      data: { played: t.played, won: t.won, lost: t.lost, tied: t.tied, points: t.points, nrr },
    });
  }

  await prisma.tournament.update({
    where: { id: tournament.id }, data: { championId: team.India.id },
  });

  console.log('\n  Group tables (first round only)');
  for (const [g, members] of Object.entries(GROUPS)) {
    const rows = members.map((n) => ({ n, ...tally[n] })).sort((x, y) => y.points - x.points);
    console.log(`  ${g}: ` + rows.map((r) => `${r.n} ${r.points}`).join(', '));
  }
  console.log(`\n✓ done — champion: India. Undo with: node scripts/seed-wc2024.mjs --undo`);
}

(UNDO ? undo() : seed())
  .catch((e) => { console.error('✗', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
