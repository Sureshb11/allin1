import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';
import { isTeamAdmin } from '../lib/teamAuth.js';
import { playerCareer } from '../lib/playerCareer.js';
import { canonicalRole } from '../lib/squadOrder.js';
import { resyncShotZones } from '../lib/ballIntelligence.js';
import { LEGAL_DELIVERY_WHERE } from '../lib/deliveries.js';
import { playerShots } from '../lib/playerShots.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';
import { benchmarkForPlayer } from '../lib/benchmark.js';

// Store the app's spelling of a role, not whoever's.
//
// Player.role is free text and this database held ten spellings of five cricket
// roles across 278 players — Bat, Batsman, Bowl, Bowler, All Rounder,
// allrounder, Wicket Keeper — because a text box sat under the role chips for
// years. The box is gone, and 195 rows have been folded back to the four names
// the app offers; this is what stops it happening again, including from an app
// version older than that fix.
//
// Deliberately non-destructive. It only rewrites a spelling it RECOGNISES:
// canonicalRole returns null for "Player", for blanks, and for every non-cricket
// sport, and in all those cases the value is stored exactly as sent. So it can
// fold "Bat" to "Batter" and can never blank a role or rename a footballer's.
const foldRole = (role, sport) => canonicalRole(role, sport || 'cricket') || role;

const router = Router();

// Player follows live in the polymorphic `Like` table under their own
// targetType — see the note on POST /:id/follow.
export const FOLLOW_TYPE = 'player_follow';

// Player.stats is a free-form Json column and POST /players accepts whatever a
// client sends (stats: z.any()), so personal details ended up living in it —
// 14 players on production carry a `phone` key. The app used to render every
// numeric-looking entry as a stat card, which put phone numbers on a screen
// anyone could open. That's fixed in the app, but the API was still handing the
// data out to any caller, so it's stripped at both ends here: on the way in so
// it stops accumulating, and on the way out so what's already stored stays put.
const PII_KEYS = ['phone', 'phoneNumber', 'mobile', 'email', 'contact', 'contactInfo', 'address', 'dob', 'password'];
const stripPII = (stats) => {
  if (!stats || typeof stats !== 'object') return stats;
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    if (!PII_KEYS.includes(k)) out[k] = v;
  }
  return out;
};


// Career numbers computed from the ball-by-ball record, shared by the list and
// the single-player route.
//
// This lived only inside GET /players. GET /players/:id returned the raw Prisma
// row, whose `stats` JSON is empty for anyone whose numbers are derived — so
// Player Insights, which fetches by id, showed a blank Career grid and a
// Fielding panel reading 0 catches for a player the leaderboard listed with
// catches. Same input, two answers, because only one route did the work.
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
      // Shared filter, not a fourth handwritten copy — this one was missing
      // 'deadBall', so a non-striker run out before release counted toward the
      // bowler's overs here and flattered the economy on every screen fed by
      // this aggregate.
      where: { ...LEGAL_DELIVERY_WHERE, ...(whereMatch ? { over: { inning: { match: whereMatch } } } : {}) },
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
      computed.oversBowled  = `${Math.floor(legal / 6)}.${legal % 6}`;
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
  
  aggregated.oversBowled = `${Math.floor(aggregated.ballsBowled / 6)}.${aggregated.ballsBowled % 6}`;
  aggregated.economy = aggregated.ballsBowled ? +(aggregated.runsConceded / (aggregated.ballsBowled / 6)).toFixed(2) : Number(baseline.economy) || 0;

  return { ...baseline, ...computed, ...aggregated };
}

async function enrichPlayers(players) {
  const sports = [...new Set(players.map((p) => p.sport || 'cricket'))];
  const statBuilders = {};
  
  let overRows = null;
  if (sports.includes('cricket')) {
    overRows = await prisma.over.findMany({ select: { id: true, inningId: true, bowlerId: true } });
  }
  
  for (const sport of sports) {
    if (sport === 'cricket') {
      const getOverall = await aggregateStats(null, overRows);
      const getLeather = await aggregateStats({ ballType: 'leather' }, overRows);
      const getTennis = await aggregateStats({ ballType: 'tennis' }, overRows);
      const getIndoor = await aggregateStats({ ballType: 'indoor' }, overRows);
      statBuilders[sport] = { getOverall, getLeather, getTennis, getIndoor };
    } else {
      statBuilders[sport] = {
        getOverall: () => ({}),
        getLeather: () => ({}),
        getTennis:  () => ({}),
        getIndoor:  () => ({}),
      };
    }
  }

  const enriched = players.map((p) => {
    const sport = p.sport || 'cricket';
    const { getOverall, getLeather, getTennis, getIndoor } = statBuilders[sport];

    const baseline = p.stats || {};
    const overallComputed = getOverall(p.id, p.name);
    const leatherComputed = getLeather(p.id, p.name);
    const tennisComputed = getTennis(p.id, p.name);
    const indoorComputed = getIndoor(p.id, p.name);

    const mergedOverall = mergeStats(baseline, overallComputed);
    const mergedLeather = mergeStats(baseline.leather || {}, leatherComputed);
    const mergedTennis = mergeStats(baseline.tennis || {}, tennisComputed);
    const mergedIndoor = mergeStats(baseline.indoor || {}, indoorComputed);

    mergedOverall.leather = mergedLeather;
    mergedOverall.tennis = mergedTennis;
    mergedOverall.indoor = mergedIndoor;

    return { ...p, stats: stripPII(mergedOverall) };
  });

  return enriched;
}

router.get('/', async (req, res) => {
  // Optional filters: ?sport=cricket  ?teamId=...  ?userId=...
  const { sport, teamId, userId } = req.query;
  const where = {};
  if (sport) where.sport = String(sport);
  if (teamId) where.teamId = String(teamId);
  if (userId) where.userId = String(userId);
  // take: 100 used to silently truncate the Rankings leaderboard — the 101st
  // player simply didn't exist. 500 is still a guard against an unbounded scan
  // but is far past the point where a local league's board stays honest.
  // The linked user carries the photo — Player has no avatar column of its own,
  // so every leaderboard face was an initial in a circle even for players whose
  // account has one.
  const players = await prisma.player.findMany({
    where,
    include: { team: true, user: { select: { id: true, avatarUrl: true } } },
    take: 500,
  });

  const enriched = await enrichPlayers(players);

  res.json({ players: enriched });
});

// GET /players/leaderboard?sport=football — per-sport player rankings.
//
// Cricket ranks on its ball-by-ball derived stats (runs, wickets, economy).
// Every other sport records SportEvents, so ranking is just each player's
// events tallied by type. Returned raw so the app can rank on whichever metric
// that sport cares about (goals, cards, points…) without a backend change.
//
// NOTE: must stay above GET /:id, or Express matches "leaderboard" as an id.
router.get('/leaderboard', async (req, res) => {
  try {
    const sport = String(req.query.sport || '');
    if (!sport) return res.status(400).json({ error: 'sport is required' });

    const players = await prisma.player.findMany({
      where: { sport },
      // Same reason as the list above: the face lives on the linked user.
      select: {
        id: true, name: true, teamId: true,
        team: { select: { name: true } },
        user: { select: { id: true, avatarUrl: true } },
      },
    });
    if (!players.length) return res.json({ players: [] });

    const events = await prisma.sportEvent.findMany({
      where: { sport, playerId: { in: players.map((p) => p.id) } },
      select: { playerId: true, eventType: true, matchId: true },
    });

    const tally = {};
    for (const e of events) {
      const t = (tally[e.playerId] ||= { totals: {}, matches: new Set() });
      t.totals[e.eventType] = (t.totals[e.eventType] || 0) + 1;
      t.matches.add(e.matchId);
    }

    res.json({
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        teamName: p.team?.name || null,
        matches: tally[p.id]?.matches.size || 0,
        eventTotals: tally[p.id]?.totals || {},
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.id },
    // The linked account carries the photo, same as the list route.
    include: { team: true, user: { select: { id: true, avatarUrl: true } } },
  });
  if (!player) return res.status(404).json({ error: 'Player not found' });
  // Through the same enrichment the list uses, so a player's numbers can't
  // differ depending on which endpoint asked. This route used to hand back the
  // raw stats JSON — empty for anyone whose figures are derived from balls.
  const [enriched] = await enrichPlayers([player]);
  res.json({ player: enriched });
});

// One player's full career, in the exact shape GET /users/me/stats returns.
// Tapping a player in Rankings opens the same board of numbers as My Stats, so
// it has to be the same computation — see lib/playerCareer.js for the three
// disagreeing implementations this replaced.
router.get('/:id/career', optionalAuth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: { team: true, user: { select: { id: true, avatarUrl: true } } },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const career = await playerCareer(player);
    // Whether the caller already follows them, so the button paints correctly on
    // open rather than only after they tap it. Anonymous callers get false.
    const following = req.user ? !!(await prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId: req.user.sub, targetType: FOLLOW_TYPE, targetId: player.id } },
    })) : false;

    // The two counts the profile header shows. Computed here rather than left
    // to the list routes so opening a profile is still one request — the header
    // needs the numbers, the lists are only fetched if somebody taps them.
    const selfIds = await selfRowIds(player);
    const [followerRows, followsPlayers, followsTeams, postCount] = await Promise.all([
      // Distinct users, not rows: see selfRowIds. groupBy rather than count,
      // because one person may follow two of this player's rows.
      prisma.like.findMany({
        where: { targetType: FOLLOW_TYPE, targetId: { in: selfIds } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      player.userId
        ? prisma.like.count({ where: { userId: player.userId, targetType: FOLLOW_TYPE } })
        : 0,
      player.userId ? prisma.teamFollow.count({ where: { userId: player.userId } }) : 0,
      // Posts are written by an ACCOUNT, so an unclaimed row has none.
      //
      // Scoped to this player's sport, because the list behind the number is:
      // GET /posts takes a sport and this profile is a cricketer's or a
      // footballer's, not the account's whole output. Unscoped, the header said
      // 7 and the list it opened showed 6.
      player.userId
        ? prisma.post.count({ where: { authorId: player.userId, sport: player.sport } })
        : 0,
    ]);

    res.json({
      ...career,
      following,
      followerCount: followerRows.length,
      // Players and teams together: the profile shows one "Following" number,
      // and a follow is a follow whichever kind of thing is on the other end.
      followingCount: followsPlayers + followsTeams,
      postCount,
      // The header this feeds draws a face and a name, which the career itself
      // knows nothing about.
      // userId so the profile can tell whether it is showing YOU — a Follow
      // button on your own profile would be nonsense.
      player: { id: player.id, name: player.name, role: player.role, avatarUrl: player.user?.avatarUrl || null, userId: player.userId || null },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /players/:id/follow — idempotent follow toggle -> { following }.
//
// Stored in the polymorphic `Like` table (userId + targetType + targetId, unique
// together), the same way saved posts are, so following a player needs NO new
// table and therefore no migration against the live database. Teams have their
// own TeamFollow table because that relation predates this pattern; if player
// follows ever need fields of their own the rows copy out to one.
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub, targetId = req.params.id;
    const player = await prisma.player.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const key = { userId_targetType_targetId: { userId, targetType: FOLLOW_TYPE, targetId } };
    const existing = await prisma.like.findUnique({ where: key });

    let following;
    if (existing) { await prisma.like.delete({ where: key }); following = false; }
    else { await prisma.like.create({ data: { userId, targetType: FOLLOW_TYPE, targetId } }); following = true; }

    res.json({ following });

    // Tell them, after the response — the follow is already saved and the app is
    // waiting on nothing else, so a slow push must not hold the tap.
    //
    // Only on the way IN. Being unfollowed is not news anyone wants delivered.
    // Through notifyUsers rather than a direct notification write: the helper
    // also pushes to the device, and a follow that only appears next time you
    // happen to open the bell screen is the one kind of notification whose whole
    // point is that it reaches you.
    if (following) {
      const target = await prisma.player.findUnique({
        where: { id: targetId }, select: { userId: true, name: true },
      });
      // Nobody to tell if the player is unclaimed, and nobody wants to hear that
      // they followed themselves — which is reachable, since a person can hold a
      // player row per team and tap one of their own.
      if (target?.userId && target.userId !== userId) {
        const me = await prisma.user.findUnique({
          where: { id: userId }, select: { firstName: true, lastName: true },
        });
        const myName = [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim() || 'Someone';
        // The follower's own player row, so tapping the notification can open
        // the person who followed you rather than a dead end.
        const myPlayer = await prisma.player.findFirst({
          where: { userId }, select: { id: true }, orderBy: { createdAt: 'asc' },
        });
        await safeNotify(() => notifyUsers([target.userId], {
          type: 'follow',
          title: 'New follower',
          message: `${myName} started following you`,
          data: { playerId: myPlayer?.id || null, userId },
        }));
      }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Who follows whom ─────────────────────────────────────────────────────────
//
// Two routes, not one, because the two directions are not the same kind of
// thing. A FOLLOWER is a user account. What you FOLLOW is a player or a team.
// Merging them into a single "connections" list would mean inventing a shape
// that fits neither and losing the distinction the UI has to draw anyway.
//
// Both are public, like the counts on the profile that link to them. The viewer
// only changes what the rows say about THEM: whether they already follow each
// row, so a list can carry a working Follow button.

const FOLLOW_PAGE = 200;

/**
 * Every player row that is this same person.
 *
 * A Player row IS a team membership — someone in three clubs has three rows, and
 * a user holds one per sport besides. A follow attaches to whichever row the
 * follower happened to tap, so "who follows this person" has to ask about all of
 * them; otherwise the same profile reports a different follower count depending
 * on which row you arrived by. An unclaimed row is only ever itself.
 */
async function selfRowIds(player) {
  if (!player?.userId) return [player.id];
  const rows = await prisma.player.findMany({
    where: { userId: player.userId }, select: { id: true },
  });
  return rows.length ? rows.map((r) => r.id) : [player.id];
}

/** Users following this player, newest first. */
router.get('/:id/followers', optionalAuth, async (req, res) => {
  try {
    const playerId = req.params.id;
    const player = await prisma.player.findUnique({
      where: { id: playerId }, select: { id: true, sport: true, userId: true },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const rows = await prisma.like.findMany({
      where: { targetType: FOLLOW_TYPE, targetId: { in: await selfRowIds(player) } },
      orderBy: { createdAt: 'desc' },
      take: FOLLOW_PAGE,
    });
    // One person following two of your rows is one follower, not two.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    if (!userIds.length) return res.json({ count: 0, followers: [] });

    const [users, linked] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        // User has no `name` column — it is composed from first/last, the same
        // way /users/me does it.
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      }),
      // A follower is only tappable if their account has a player behind it.
      // Prefer one in the same sport as the profile being viewed: a user can
      // hold a player row per sport, and opening a cricketer's follower on
      // their badminton profile is the wrong page.
      prisma.player.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, userId: true, sport: true, name: true },
      }),
    ]);

    const playerFor = {};
    for (const pl of linked) {
      const held = playerFor[pl.userId];
      if (!held || (pl.sport === player.sport && held.sport !== player.sport)) playerFor[pl.userId] = pl;
    }

    // Two different questions, both answered in one round trip each rather than
    // one per row:
    //
    //   `mine`      — does the VIEWER follow this row? Drives the Follow button.
    //   `followedBack` — does the SUBJECT of this list follow them? Drives the
    //                 "Follows you" marker, which is the label that makes a
    //                 follower list worth reading. On your own list the two
    //                 coincide; on someone else's they do not, and conflating
    //                 them would put "Follows you" on strangers.
    const rowPlayerIds = Object.values(playerFor).map((pl) => pl.id);
    const [viewerFollows, subjectFollows] = await Promise.all([
      req.user && rowPlayerIds.length
        ? prisma.like.findMany({
            where: { userId: req.user.sub, targetType: FOLLOW_TYPE, targetId: { in: rowPlayerIds } },
            select: { targetId: true },
          })
        : [],
      player.userId && rowPlayerIds.length
        ? prisma.like.findMany({
            where: { userId: player.userId, targetType: FOLLOW_TYPE, targetId: { in: rowPlayerIds } },
            select: { targetId: true },
          })
        : [],
    ]);
    const mine = new Set(viewerFollows.map((x) => x.targetId));
    const followedBack = new Set(subjectFollows.map((x) => x.targetId));

    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const firstSeen = new Map();
    for (const r of rows) if (!firstSeen.has(r.userId)) firstSeen.set(r.userId, r.createdAt);
    // Built before it is counted: a deleted account leaves its follow row
    // behind, and a count taken off the rows would name more followers than the
    // list can show.
    const followers = userIds
      .filter((uid) => !!byId[uid])
      .map((uid) => {
        const u = byId[uid];
        const pl = playerFor[uid] || null;
        return {
          userId: uid,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || pl?.name || 'Player',
          avatarUrl: u.avatarUrl || null,
          playerId: pl?.id || null,
          sport: pl?.sport || null,
          following: pl ? mine.has(pl.id) : false,
          // Mutual: this follower is also followed by the person whose list
          // this is. Named for what the reader sees, not for the set operation.
          followsBack: pl ? followedBack.has(pl.id) : false,
          followedAt: firstSeen.get(uid),
        };
      });
    res.json({ count: followers.length, followers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Players and teams this player's account follows. */
router.get('/:id/following', optionalAuth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id }, select: { id: true, userId: true },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    // Following is a property of an ACCOUNT, not of a player row. An unclaimed
    // player — one somebody added to a squad who has never signed in — follows
    // nothing, and that is a real answer rather than a missing one.
    if (!player.userId) return res.json({ count: 0, players: [], teams: [], linked: false });

    const [likes, teamRows] = await Promise.all([
      prisma.like.findMany({
        where: { userId: player.userId, targetType: FOLLOW_TYPE },
        orderBy: { createdAt: 'desc' },
        take: FOLLOW_PAGE,
      }),
      prisma.teamFollow.findMany({
        where: { userId: player.userId },
        orderBy: { createdAt: 'desc' },
        take: FOLLOW_PAGE,
        include: { team: { select: { id: true, name: true, shortName: true, logoUrl: true, sport: true } } },
      }),
    ]);

    const players = likes.length
      ? await prisma.player.findMany({
          where: { id: { in: likes.map((l) => l.targetId) } },
          select: {
            id: true, name: true, role: true, sport: true, userId: true,
            team: { select: { name: true } },
            user: { select: { avatarUrl: true } },
          },
        })
      : [];
    // Keep the order the follows were made in; findMany does not.
    const order = Object.fromEntries(likes.map((l, i) => [l.targetId, i]));
    players.sort((a, b) => order[a.id] - order[b.id]);

    // Which of these follow the subject back. Asked from the other side: every
    // row this account owns, and who among the followed accounts follows one.
    const selfIds = await selfRowIds({ id: player.id, userId: player.userId });
    const followerUserIds = players.length
      ? new Set((await prisma.like.findMany({
          where: { targetType: FOLLOW_TYPE, targetId: { in: selfIds } },
          select: { userId: true },
          distinct: ['userId'],
        })).map((x) => x.userId))
      : new Set();

    res.json({
      linked: true,
      count: players.length + teamRows.length,
      players: players.map((p) => ({
        id: p.id, name: p.name, role: p.role, sport: p.sport,
        team: p.team?.name || null, avatarUrl: p.user?.avatarUrl || null,
        followsBack: !!p.userId && followerUserIds.has(p.userId),
      })),
      teams: teamRows.filter((t) => t.team).map((t) => ({
        id: t.team.id, name: t.team.name, shortName: t.team.shortName,
        logoUrl: t.team.logoUrl, sport: t.team.sport,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Shot analytics: everything this batter has been recorded playing ─────────
//
// Separate from /career on purpose. Career figures exist for every player from
// the first ball ever scored; this exists only for the deliveries somebody chose
// to capture, which will be a small and uneven slice for a long time. Folding
// them together would make a career page silently change meaning depending on
// whether a scorer happened to switch the feature on.
router.get('/:id/shots', async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, battingStyle: true },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const data = await playerShots(prisma, [player.id], player);
    res.json({
      player: { id: player.id, name: player.name, hand: data.hand },
      ...data,
      // Null for almost everybody, and that is the expected case: it means no
      // licensed benchmark has been linked. Guarded inside, so a profile
      // renders whether or not those tables have even been migrated.
      benchmark: await benchmarkForPlayer(prisma, player.id, data.analytics),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PlayerSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  teamId: z.string().optional(),
  userId: z.string().optional(),   // link to an existing Local Legends user
  sport: z.string().optional(),
  stats: z.any().optional(),
  // How they bat and bowl. Bowling style is genuinely optional — plenty of
  // cricketers never bowl — and "None" is a real answer, not an absent one.
  battingStyle: z.string().max(40).optional().nullable(),
  bowlingStyle: z.string().max(40).optional().nullable(),
});

router.post('/', async (req, res) => {
  try {
    const data = PlayerSchema.parse(req.body);
    if (data.stats) data.stats = stripPII(data.stats);
    data.role = foldRole(data.role, data.sport);
    // Prevent duplicates on the same team: a linked app user can only appear once,
    // and a guest can't be added twice under the exact same name.
    if (data.teamId) {
      const dupe = await prisma.player.findFirst({
        where: data.userId
          ? { teamId: data.teamId, userId: data.userId }             // same linked account
          : { teamId: data.teamId, name: { equals: data.name, mode: 'insensitive' } }, // guest can't shadow any existing member
        select: { id: true },
      });
      if (dupe) {
        return res.status(409).json({ error: `${data.name} is already in this team.` });
      }
    }
    const player = await prisma.player.create({ data });
    res.status(201).json({ player });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Edit a squad member's details — role, shirt number and captaincy. Team admins
// only. Captain / vice-captain are singular per team, so setting one clears it
// from every other member on the same team.
const EditPlayerSchema = z.object({
  role: z.string().min(1).optional(),
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
  isCaptain: z.boolean().optional(),
  isViceCaptain: z.boolean().optional(),
  battingStyle: z.string().max(40).optional().nullable(),
  bowlingStyle: z.string().max(40).optional().nullable(),
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.teamId && !(await isTeamAdmin(player.teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can edit members' });
    }
    const data = EditPlayerSchema.parse(req.body);
    if (data.stats) data.stats = stripPII(data.stats);
    // The player's own sport, not the caller's word for it.
    if (data.role) data.role = foldRole(data.role, player.sport);

    // A shirt number belongs to one player in a squad. Two number 7s make a
    // scorecard ambiguous and a squad list sort arbitrarily, and nothing was
    // stopping it. Null clears the number, which is always allowed.
    if (data.jerseyNumber != null && player.teamId) {
      const clash = await prisma.player.findFirst({
        where: { teamId: player.teamId, jerseyNumber: data.jerseyNumber, NOT: { id: player.id } },
        select: { name: true },
      });
      if (clash) {
        return res.status(409).json({ error: `${clash.name} already wears ${data.jerseyNumber}.` });
      }
    }

    const ops = [];
    // A captain / vice-captain is unique per team — demote the current holder first.
    if (data.isCaptain === true && player.teamId) {
      ops.push(prisma.player.updateMany({
        where: { teamId: player.teamId, isCaptain: true, NOT: { id: player.id } },
        data: { isCaptain: false },
      }));
    }
    if (data.isViceCaptain === true && player.teamId) {
      ops.push(prisma.player.updateMany({
        where: { teamId: player.teamId, isViceCaptain: true, NOT: { id: player.id } },
        data: { isViceCaptain: false },
      }));
    }
    ops.push(prisma.player.update({ where: { id: player.id }, data }));
    const [updated] = (await prisma.$transaction(ops)).slice(-1);
    // A team admin correcting someone's batting hand renames every shot that
    // player has already played: a zone is a function of the angle AND the hand,
    // and a player with nothing recorded was being treated as a right-hander.
    // Guarded so a squad edit can never fail because of the analytics table.
    if (data.battingStyle !== undefined && data.battingStyle !== player.battingStyle) {
      await resyncShotZones(prisma, player.id).catch((e) => console.error('[resyncShotZones]', e.message));
    }
    res.json({ player: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a player from their team's squad. Any team admin (owner or promoted
// member) may do this. The player is detached (teamId → null) rather than
// hard-deleted, so any match/scoring history that references them stays intact.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id }, include: { team: true },
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.teamId && !(await isTeamAdmin(player.teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can remove members' });
    }
    await prisma.player.update({ where: { id: req.params.id }, data: { teamId: null, isAdmin: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Player insights — the qualitative read on a career: what they're good at,
// what to work on, what to do next.
//
// The numbers behind it come from lib/playerCareer.js, the same computation the
// career board draws. They used to be worked out here, a third time, and more
// crudely: oversBowled counted Over ROWS (a two-ball over was a whole over, so
// economy was runs ÷ overs-started), fours counted byes, and runs conceded came
// off the Over aggregate with byes included. So this screen could tell a player
// their economy was fine while the scorecard and My Stats both said otherwise.
router.get('/:id/insights', async (req, res) => {
  try {
    const playerId = req.params.id;
    const player = await prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const { stats } = await playerCareer(player);
    const num = (v) => (v == null ? 0 : Number(v) || 0);
    const totalRuns    = num(stats.runs);
    const ballsFaced   = num(stats.ballsFaced);
    const strikeRate   = num(stats.strikeRate);
    const battingAvg   = num(stats.average);
    const boundaries   = num(stats.fours) + num(stats.sixes);
    const wicketsTaken = num(stats.wickets);
    const economy      = num(stats.economy);
    const ballsBowled  = num(stats.ballsBowled);
    const matchCount   = num(stats.matches);

    let recentForm = 'N/A';
    let trend = 'stable';
    const strongPoints = [];
    const improvementAreas = [];
    const recommendations = [];

    if (totalRuns > 0) {
      if (strikeRate > 120) strongPoints.push('Aggressive batting');
      if (battingAvg > 30) strongPoints.push('Consistent run scorer');
      if (boundaries > 10) strongPoints.push('Good boundary hitting');
    }
    if (wicketsTaken > 0) {
      if (economy < 6) strongPoints.push('Economical bowling');
      if (wicketsTaken > 5) strongPoints.push('Regular wicket taker');
    }
    // Dots are pressure, and the ledger now counts them properly.
    if (ballsBowled >= 12 && num(stats.dotBalls) / ballsBowled > 0.4) strongPoints.push('Builds pressure with dots');
    if (strongPoints.length === 0) strongPoints.push(player.role || 'All-rounder');

    if (strikeRate < 80 && ballsFaced > 10) improvementAreas.push('Strike rate needs improvement');
    // 3 overs, in balls — the old test compared against a count of Over rows.
    if (economy > 8 && ballsBowled > 18) improvementAreas.push('Economy rate too high');
    if (num(stats.sixesConceded) > 5) improvementAreas.push('Going for too many sixes');
    if (matchCount < 3) improvementAreas.push('Needs more match experience');

    if (matchCount >= 3) {
      recentForm = battingAvg > 25 ? 'Good' : 'Average';
      trend = strikeRate > 100 ? 'upward' : 'stable';
    }

    if (improvementAreas.length > 0) recommendations.push('Focus on ' + improvementAreas[0].toLowerCase());
    if (matchCount < 5) recommendations.push('Play more matches to build consistency');
    if (strongPoints.length > 0) recommendations.push('Continue leveraging ' + strongPoints[0].toLowerCase());

    res.json({
      insights: {
        performance: { recentForm, trend, strongPoints, improvementAreas },
        // The full career rides along, so a caller needing numbers uses the same
        // ones rather than a second, differently-computed set.
        statistics: {
          ...stats,
          // Legacy aliases. This payload used to name these three differently,
          // and an installed app is still asking for them by the old names —
          // dropping them turned Runs, Average, Wickets and Bowling Avg into
          // dashes on every phone that hadn't updated yet. Cheap to keep; an
          // API doesn't get to assume its clients were all replaced at once.
          totalRuns:      stats.runs ?? 0,
          wicketsTaken:   stats.wickets ?? 0,
          battingAverage: stats.average ?? 0,
        },
        recommendations,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
