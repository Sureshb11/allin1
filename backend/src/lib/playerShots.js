// A batter's recorded shots, rolled up.
//
// Extracted because TWO screens ask for this and they must not answer
// differently: "My Stats" (the logged-in user) and a tapped player's profile.
// The same thing happened to career figures once already — two routes computing
// cricket two ways, so the same player read differently depending on which
// screen you were on — and lib/playerCareer.js exists because of it. This is
// that lesson applied before it happens rather than after.
//
// Takes a LIST of player ids, not one. A user holds a Player row per team, so
// "my shots" spans several rows while a tapped profile is a single one; passing
// a list makes the single case a list of one instead of a different code path.

import { zoneFromAngle } from './ballIntelligence.js';
import { aggregateShots, strengthsAndWeaknesses, playerDna } from './shotAnalytics.js';
import { inningsPhase, bowlingKind } from './deliveries.js';

export const playerShots = async (prisma, playerIds, player) => {
  const ids = (Array.isArray(playerIds) ? playerIds : [playerIds]).filter(Boolean);
  if (!ids.length) return null;

  const rows = await prisma.ballIntelligence.findMany({
    where: { ball: { batterId: { in: ids } } },
    orderBy: { createdAt: 'asc' },
    select: {
      shotAngle: true, shotZone: true, shotDistance: true, shotType: true,
      ball: {
        select: {
          runs: true, isWicket: true,
          bowler: { select: { bowlingStyle: true } },
          over: {
            select: {
              overNumber: true,
              inning: { select: { match: { select: { overs: true } } } },
            },
          },
        },
      },
    },
  });

  // Zone re-derived from the angle and the batter's CURRENT hand, never read
  // back from the stored column — see the intelligence endpoint for why.
  const hand = /left/i.test(String(player?.battingStyle || '')) ? 'left' : 'right';

  const shots = rows.map((r) => ({
    angle: r.shotAngle,
    zone: zoneFromAngle(r.shotAngle, hand),
    distance: r.shotDistance,
    shotType: r.shotType,
    runs: r.ball?.runs ?? 0,
    isWicket: !!r.ball?.isWicket,
    // Both may legitimately be null; the aggregate counts those as
    // unclassified and reports the coverage rather than guessing.
    phase: inningsPhase(r.ball?.over?.overNumber, r.ball?.over?.inning?.match?.overs),
    bowlerKind: bowlingKind(r.ball?.bowler?.bowlingStyle),
  }));

  const analytics = aggregateShots(shots);
  return {
    shots,
    analytics,
    insights: strengthsAndWeaknesses(analytics),
    dna: playerDna(shots, player),
    hand,
  };
};

export default { playerShots };
