import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const MID = 'cmsx2wmki000120fdj5nso50e';
const inns = await p.inning.findMany({ where: { matchId: MID } });
const cur = inns[inns.length - 1];
const balls = await p.ball.findMany({
  where: { over: { inningId: cur.id } },
  orderBy: [{ over: { overNumber: 'asc' } }, { ballNumber: 'asc' }],
  include: {
    over: { include: { bowler: { select: { name: true } } } },
    batter: { select: { name: true } },
    nonStriker: { select: { name: true } },
    intelligence: true,
  },
});
console.log('Total deliveries this innings:', balls.length);
console.log('');
for (const b of balls) {
  const t = new Date(parseInt(b.id.slice(1, 9), 36));
  const i = b.intelligence;
  console.log(
    `ov ${String(b.over.overNumber).padStart(2)}.${b.ballNumber}  `+
    `${t.toISOString()}  `+
    `${(b.batter?.name||'?').padEnd(18)} vs ${(b.over.bowler?.name||'?').padEnd(12)} `+
    `r=${b.runs}${b.extraType?(' '+b.extraType):''}${b.isWicket?' WICKET':''}  `+
    `ballId=${b.id}`+
    (i ? `  BI[shot=${i.shotType||'-'} zone=${i.shotZone||'-'} lofted=${JSON.stringify(i.lofted)} rank=${i.selectedShotRank} ev=${i.rankingEngineVersion} biId=${i.id}]` : '')
  );
}
await p.$disconnect();
