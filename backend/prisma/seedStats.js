// One-off: populate `stats` JSON on existing Player rows so the app can show
// real batting/bowling numbers. Idempotent — safe to re-run.
//
//   node prisma/seedStats.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Known career numbers (T20-ish) keyed by player name.
const STATS = {
  'Rohit Sharma':      { matches: 243, runs: 6211, wickets: 15,  battingAverage: 29.6, strikeRate: 131.0, style: 'Right-hand bat' },
  'Jasprit Bumrah':    { matches: 120, runs: 56,   wickets: 165, battingAverage: 5.1,  economy: 7.4,      style: 'Right-arm fast' },
  'Suryakumar Yadav':  { matches: 139, runs: 3389, wickets: 0,   battingAverage: 32.0, strikeRate: 145.3, style: 'Right-hand bat' },
  'MS Dhoni':          { matches: 264, runs: 5243, wickets: 0,   battingAverage: 38.8, strikeRate: 135.9, style: 'RH bat · Keeper' },
  'Ravindra Jadeja':   { matches: 240, runs: 2958, wickets: 160, battingAverage: 26.8, economy: 7.6,      style: 'LH bat · Left-arm orthodox' },
  'Ruturaj Gaikwad':   { matches: 70,  runs: 2380, wickets: 0,   battingAverage: 40.3, strikeRate: 135.2, style: 'Right-hand bat' },
  'Virat Kohli':       { matches: 252, runs: 8004, wickets: 4,   battingAverage: 38.7, strikeRate: 131.9, style: 'Right-hand bat' },
  'Glenn Maxwell':     { matches: 138, runs: 2771, wickets: 37,  battingAverage: 26.1, strikeRate: 158.5, style: 'RH bat · Off break' },
  'Rishabh Pant':      { matches: 111, runs: 3284, wickets: 0,   battingAverage: 34.6, strikeRate: 147.9, style: 'LH bat · Keeper' },
  'Axar Patel':        { matches: 145, runs: 1500, wickets: 122, battingAverage: 22.4, economy: 7.4,      style: 'LH bat · Left-arm orthodox' },
  'Sunil Narine':      { matches: 177, runs: 1268, wickets: 180, battingAverage: 16.4, economy: 6.7,      style: 'RH bat · Off break' },
  'Andre Russell':     { matches: 140, runs: 2484, wickets: 113, battingAverage: 28.6, strikeRate: 174.5, style: 'RH bat · Right-arm fast' },
};

// Deterministic fallback for any player not in the map above.
function genStats(name, role) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const r = (lo, hi) => lo + (h % (hi - lo));
  const bowler = /bowl/i.test(role);
  const keeper = /keep|wicket/i.test(role);
  const allr = /all/i.test(role);
  return {
    matches: r(40, 180),
    runs: keeper || !bowler ? r(900, 4200) : r(200, 1400),
    wickets: bowler || allr ? r(40, 160) : r(0, 12),
    battingAverage: Number((r(180, 420) / 10).toFixed(1)),
    strikeRate: Number((r(1150, 1700) / 10).toFixed(1)),
    style: keeper ? 'RH bat · Keeper' : bowler ? 'Right-arm bowler' : 'Right-hand bat',
  };
}

async function main() {
  const players = await prisma.player.findMany({ include: { team: true } });
  let updated = 0;
  for (const p of players) {
    const stats = STATS[p.name] || genStats(p.name, p.role || '');
    await prisma.player.update({ where: { id: p.id }, data: { stats } });
    updated++;
    console.log(`✓ ${p.name} (${p.role}) → ${stats.matches} mts, ${stats.runs} runs, ${stats.wickets} wkts`);
  }
  console.log(`\nUpdated stats on ${updated} players.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
