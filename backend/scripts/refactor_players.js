const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/routes/players.js');
let code = fs.readFileSync(filePath, 'utf8');

const regex = /async function enrichPlayers\(players\) \{([\s\S]*?)return enriched;\n\}/;

const newCode = `
async function aggregateStats(whereMatch, overRows) {
  const [batAgg, catchAgg, runOutAgg, disAgg, bowlAgg, mpAgg, inningAgg, legalAgg] = await Promise.all([
    prisma.ball.groupBy({ by: ['batterId'], _sum: { runs: true }, _count: { _all: true }, where: whereMatch ? { over: { inning: { match: whereMatch } } } : undefined }),
    prisma.ball.groupBy({
      by: ['wicketAssists'], _count: { _all: true },
      where: { isWicket: true, wicketType: 'caught', wicketAssists: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
    prisma.ball.groupBy({
      by: ['wicketAssists'], _count: { _all: true },
      where: { isWicket: true, wicketType: 'runout', wicketAssists: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
    prisma.ball.groupBy({ by: ['dismissedPlayerId'], _count: { _all: true }, where: { dismissedPlayerId: { not: null }, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) } }),
    prisma.over.groupBy({ by: ['bowlerId'], _sum: { runs: true, extras: true, wickets: true }, _count: { _all: true }, where: whereMatch ? { inning: { match: whereMatch } } : undefined }),
    prisma.matchPlayer.groupBy({ by: ['playerId'], _count: { _all: true }, where: whereMatch ? { match: whereMatch } : undefined }),
    prisma.ball.groupBy({ by: ['batterId', 'overId'], _sum: { runs: true }, where: whereMatch ? { over: { inning: { match: whereMatch } } } : undefined }),
    prisma.ball.groupBy({
      by: ['overId'], _count: { _all: true },
      where: { OR: [{ extraType: null }, { extraType: { notIn: ['wide', 'noBall', 'penalty', 'retired'] } }], ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
    }),
  ]);

  const inningOf = Object.fromEntries(overRows.map((o) => [o.id, o.inningId]));
  const bowlerOf = Object.fromEntries(overRows.map((o) => [o.id, o.bowlerId]));
  const legalBy = {};                     // bowlerId → legal balls bowled
  for (const g of legalAgg) {
    const bid = bowlerOf[g.overId];
    if (!bid) continue;
    legalBy[bid] = (legalBy[bid] || 0) + g._count._all;
  }
  const knock = {};                       // batterId → { inningId → runs }
  for (const g of inningAgg) {
    const inn = inningOf[g.overId];
    if (!inn) continue;
    (knock[g.batterId] = knock[g.batterId] || {});
    knock[g.batterId][inn] = (knock[g.batterId][inn] || 0) + (g._sum.runs || 0);
  }
  const bat  = Object.fromEntries(batAgg.map((a) => [a.batterId, a]));
  const dis  = Object.fromEntries(disAgg.map((a) => [a.dismissedPlayerId, a._count._all]));
  const bowl = Object.fromEntries(bowlAgg.map((a) => [a.bowlerId, a]));
  const mp   = Object.fromEntries(mpAgg.map((a) => [a.playerId, a._count._all]));
  const byName = (rows) => {
    const out = {};
    for (const r of rows) {
      const key = (r.wicketAssists || '').trim();
      if (key) out[key] = (out[key] || 0) + r._count._all;
    }
    return out;
  };
  const catches = byName(catchAgg);
  const runOuts = byName(runOutAgg);

  const getPlayerComputed = (pId, pName) => {
    const b = bat[pId], w = bowl[pId];
    const computed = {};
    if (b) {
      const runs = b._sum.runs || 0, faced = b._count._all;
      const outs = dis[pId] || 0;
      computed.runs = runs;
      computed.strikeRate = faced ? +(runs / faced * 100).toFixed(1) : 0;
      computed.average = outs ? +(runs / outs).toFixed(1) : runs;
      const scores = Object.values(knock[pId] || {});
      computed.centuries     = scores.filter((r) => r >= 100).length;
      computed.halfCenturies = scores.filter((r) => r >= 50 && r < 100).length;
      computed.highestScore  = scores.length ? Math.max(...scores) : 0;
      computed.innings   = scores.length;
      computed.battingInnings = scores.length;
      computed.ballsFaced = faced;
      computed.outs = outs;
    }
    if (w) {
      const conceded = (w._sum.runs || 0) + (w._sum.extras || 0);
      const legal = legalBy[pId] || 0;
      computed.wickets      = w._sum.wickets || 0;
      computed.runsConceded = conceded;
      computed.ballsBowled  = legal;
      computed.oversBowled  = \`\${Math.floor(legal / 6)}.\${legal % 6}\`;
      computed.economy      = legal ? +(conceded / (legal / 6)).toFixed(2) : 0;
      computed.bowlingInnings = w._sum.wickets !== null || legal > 0 ? 1 : 0;
    }
    const nm = (pName || '').trim();
    computed.catches = catches[nm] || 0;
    computed.runOuts = runOuts[nm] || 0;
    if (mp[pId]) computed.matches = mp[pId];
    return computed;
  };
  
  return getPlayerComputed;
}

function mergeStats(baseline = {}, computed = {}) {
  const aggregated = {};
  const add = (key) => (Number(baseline[key]) || 0) + (computed[key] || 0);
  
  aggregated.runs = add('runs');
  aggregated.matches = add('matches');
  aggregated.innings = add('innings'); 
  aggregated.battingInnings = add('battingInnings') || add('innings'); 
  aggregated.bowlingInnings = add('bowlingInnings');
  aggregated.ballsFaced = add('ballsFaced');
  aggregated.fours = add('fours');
  aggregated.sixes = add('sixes');
  aggregated.centuries = add('centuries');
  aggregated.halfCenturies = add('halfCenturies');
  aggregated.highestScore = Math.max(Number(baseline.highestScore) || 0, computed.highestScore || 0);
  
  aggregated.wickets = add('wickets');
  aggregated.runsConceded = add('runsConceded');
  aggregated.ballsBowled = add('ballsBowled');
  aggregated.catches = add('catches');
  aggregated.runOuts = add('runOuts');

  const totalOuts = (Number(baseline.outs) || 0) + (computed.outs || 0);
  aggregated.average = totalOuts ? +(aggregated.runs / totalOuts).toFixed(1) : aggregated.runs;
  aggregated.strikeRate = aggregated.ballsFaced ? +(aggregated.runs / aggregated.ballsFaced * 100).toFixed(1) : Number(baseline.strikeRate) || 0;
  
  aggregated.oversBowled = \`\${Math.floor(aggregated.ballsBowled / 6)}.\${aggregated.ballsBowled % 6}\`;
  aggregated.economy = aggregated.ballsBowled ? +(aggregated.runsConceded / (aggregated.ballsBowled / 6)).toFixed(2) : Number(baseline.economy) || 0;

  return { ...baseline, ...computed, ...aggregated };
}

async function enrichPlayers(players) {
  const overRows = await prisma.over.findMany({ select: { id: true, inningId: true, bowlerId: true } });
  
  const getOverall = await aggregateStats(null, overRows);
  const getLeather = await aggregateStats({ ballType: 'leather' }, overRows);
  const getTennis = await aggregateStats({ ballType: 'tennis' }, overRows);

  const enriched = players.map((p) => {
    const baseline = p.stats || {};
    const overallComputed = getOverall(p.id, p.name);
    const leatherComputed = getLeather(p.id, p.name);
    const tennisComputed = getTennis(p.id, p.name);

    const mergedOverall = mergeStats(baseline, overallComputed);
    const mergedLeather = mergeStats(baseline.leather || {}, leatherComputed);
    const mergedTennis = mergeStats(baseline.tennis || {}, tennisComputed);

    mergedOverall.leather = mergedLeather;
    mergedOverall.tennis = mergedTennis;

    return { ...p, stats: stripPII(mergedOverall) };
  });

  return enriched;
}
`;

fs.writeFileSync(filePath, code.replace(regex, newCode.trim()));
console.log('Refactored players.js successfully.');
