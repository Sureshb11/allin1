// feed.js — Module 8 activity-feed writer.
//
// pushFeedItem() denormalises a whole card into ActivityFeed.payload (JSONB) at
// write time, so the feed renders any card type with no joins. Called by the
// milestone engine and match-complete path.

import { prisma } from './prisma.js';

export async function pushFeedItem({ type, sport, actorId, subjectType, subjectId, payload }) {
  try {
    return await prisma.activityFeed.create({
      data: { type, sport, actorId: actorId || null, subjectType, subjectId, payload },
    });
  } catch (e) {
    console.error('[feed] push failed:', e.message);
  }
}

// A completed match → a "match_result" card (both teams + score, self-contained).
export async function pushMatchResultCard(match) {
  const [t1, t2] = await Promise.all([
    prisma.team.findUnique({ where: { id: match.team1Id }, select: { name: true } }),
    prisma.team.findUnique({ where: { id: match.team2Id }, select: { name: true } }),
  ]);
  return pushFeedItem({
    type: 'match_result', sport: match.sport,
    subjectType: 'match', subjectId: match.id,
    payload: {
      teams: [t1?.name || 'Team 1', t2?.name || 'Team 2'],
      score1: match.score1 || '—', score2: match.score2 || '—',
      result: match.result || 'Completed',
      matchId: match.id,
    },
  });
}
