// Who is playing, who is captaining, and who is keeping wicket.
//
// Its own module rather than living in the route, so the rules can be tested
// without standing up an Express router and a Prisma client pointed at the
// production database (there is no local one — see CLAUDE.md).

import { z } from 'zod';

// A squad as the two pre-match screens send it: who is playing, and — new —
// who is captaining and who is keeping wicket TODAY.
//
// MatchPlayer has carried isCaptain / isViceCaptain / isWk all along and
// nothing ever wrote them: all 478 rows on production are false, so the squad
// ordering rule ("captain, vice, keepers, then batters…") had nothing to order
// by and no scorecard has ever shown a (C) or a (WK). The toss screen is the
// right place to ask, because it is the one moment someone is looking at both
// XIs and knows the answer.
//
// Every field is optional: a scorer who doesn't know, or doesn't care, must
// still be able to start the match.
export const SquadSchema = z.object({
  teamId:        z.string(),
  playerIds:     z.array(z.string()).min(1),
  captainId:     z.string().nullable().optional(),
  viceCaptainId: z.string().nullable().optional(),
  keeperId:      z.string().nullable().optional(),
});

const ROLE_LABEL = { captainId: 'captain', viceCaptainId: 'vice-captain', keeperId: 'wicketkeeper' };

// MatchPlayer rows for a squad payload. Throws rather than silently dropping a
// designation that isn't in the XI — a captain who quietly doesn't stick is
// worse than an error, because nothing on the scorecard would say so.
export function squadRows(matchId, squads) {
  return squads.flatMap((sq) => {
    for (const field of ['captainId', 'viceCaptainId', 'keeperId']) {
      const id = sq[field];
      if (id && !sq.playerIds.includes(id)) {
        throw new Error(`The ${ROLE_LABEL[field]} must be one of the players selected for this match.`);
      }
    }
    if (sq.captainId && sq.captainId === sq.viceCaptainId) {
      throw new Error('One player cannot be both captain and vice-captain.');
    }
    return sq.playerIds.map((playerId) => ({
      matchId, teamId: sq.teamId, playerId,
      isCaptain:     playerId === sq.captainId,
      isViceCaptain: playerId === sq.viceCaptainId,
      isWk:          playerId === sq.keeperId,
    }));
  });
}
