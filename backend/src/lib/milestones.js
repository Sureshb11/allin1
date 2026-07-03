// milestones.js — Module 6 milestone detection.
//
// Serverless-native alternative to a Kafka/RabbitMQ consumer: called inline at
// match-complete, it recomputes each linked player's career count for the
// sport's tracked stats and, for every threshold newly reached, creates a
// Notification (the push trigger). Idempotent — a milestone that already has a
// notification is skipped, so re-running is safe.

import { prisma } from './prisma.js';
import { pushFeedItem } from './feed.js';

// Career thresholds per sport/stat. Editable; small lists → cheap to scan.
const MILESTONES = {
  cricket:  { wickets: [10, 25, 50, 100, 200], runs: [500, 1000, 2500, 5000, 10000] },
  football: { goals: [10, 25, 50, 100] },
  hockey:   { goals: [10, 25, 50] },
  handball: { goals: [25, 50, 100] },
  basketball: { points: [250, 500, 1000, 2500] },
};
const LABEL = { wickets: 'wicket', runs: 'run', goals: 'goal', points: 'point' };
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Career count for a (player, sport, stat) from the event/ball logs.
async function careerCount(playerId, sport, stat) {
  if (sport === 'cricket' && stat === 'wickets')
    return prisma.ball.count({ where: { over: { bowlerId: playerId }, isWicket: true, wicketType: { not: 'runOut' } } });
  if (sport === 'cricket' && stat === 'runs') {
    const agg = await prisma.ball.aggregate({ _sum: { runs: true }, where: { batterId: playerId } });
    return agg._sum.runs || 0;
  }
  if (stat === 'goals')
    return prisma.sportEvent.count({ where: { playerId, sport, eventType: 'goal' } });
  if (stat === 'points') {
    const agg = await prisma.sportEvent.aggregate({ _sum: { value: true }, where: { playerId, sport } });
    return agg._sum.value || 0;
  }
  return 0;
}

// Detect + notify milestones for every linked player who took part in a match.
// Fire-and-forget from the match-complete path — never blocks scoring.
export async function checkMatchMilestones(matchId) {
  try {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return;
    const sportRules = MILESTONES[match.sport];
    if (!sportRules) return;

    const squad = await prisma.matchPlayer.findMany({
      where: { matchId }, include: { player: true },
    });
    const linked = squad.map((s) => s.player).filter((p) => p && p.userId);
    if (!linked.length) return;

    // One query for all already-notified milestone titles across these users,
    // so we don't do a findFirst per threshold (Neon latency adds up fast).
    const userIds = [...new Set(linked.map((p) => p.userId))];
    const existing = await prisma.notification.findMany({
      where: { userId: { in: userIds }, type: 'milestone' },
      select: { userId: true, title: true },
    });
    const seen = new Set(existing.map((n) => `${n.userId}|${n.title}`));

    const toCreate = [];
    for (const player of linked) {
      for (const [stat, thresholds] of Object.entries(sportRules)) {
        const count = await careerCount(player.id, match.sport, stat);
        for (const th of thresholds) {
          if (count < th) continue;
          const title = `${ordinal(th)} ${match.sport} ${LABEL[stat]}!`;
          if (seen.has(`${player.userId}|${title}`)) continue;
          seen.add(`${player.userId}|${title}`);
          const message = `${player.name} reached ${th} career ${LABEL[stat]}${th === 1 ? '' : 's'} 🎯`;
          toCreate.push({ userId: player.userId, type: 'milestone', title, message });
          // Public social card — the same milestone becomes a feed item, not
          // just a private notification.
          await pushFeedItem({
            type: 'milestone', sport: match.sport,
            actorId: player.userId, subjectType: 'player', subjectId: player.id,
            payload: { title, player: { id: player.id, name: player.name }, stat: `${th} ${LABEL[stat]}${th === 1 ? '' : 's'}`, matchId: match.id },
          });
        }
      }
    }
    if (toCreate.length) await prisma.notification.createMany({ data: toCreate });
  } catch (e) {
    console.error('[milestones] check failed:', e.message);
  }
}
