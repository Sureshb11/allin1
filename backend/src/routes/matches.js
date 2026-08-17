import { Router } from 'express';
import { z } from 'zod';
import { SquadSchema, squadRows } from '../lib/matchSquad.js';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { validateSquad, applySubstitution } from '../lib/roster.js';
import { checkMatchMilestones } from '../lib/milestones.js';
import { pushMatchResultCard } from '../lib/feed.js';
import { reportMatchToTournament } from '../lib/tournamentResult.js';
import { computeAwards } from '../lib/mvp.js';
import { persistMatchAwards, hasMatchAwards } from '../lib/awards.js';
import { safeNotify, notifyUsers, notifyMatchLive, notifyMatchResult, pingMatchWatchers } from '../lib/notify.js';
import { liveSummary } from '../lib/liveSummary.js';
import { canonicalVenue } from '../lib/venue.js';
import { normaliseShot, shotOutcome, zoneFromAngle, shotLabel, zoneLabel } from '../lib/ballIntelligence.js';
import { maybeStoreAiLine } from '../lib/momentCommentary.js';
import { commentaryFor } from '../lib/shotCommentary.js';
import { matchShotSummary } from '../lib/shotAnalytics.js';

const router = Router();

// Extra types that are NOT a legal delivery, so they never advance the over or
// the ball-in-over count: wides & no-balls (re-bowled), penalty runs (a team
// award, not a ball) and retirements (an admin event). Byes/leg-byes DO count —
// they're a legal ball. This must match the client scorer, which scores a
// penalty/retirement with countsAsBall=false; leaving penalty out here made the
// server count it as a ball, so the over drifted a ball ahead of the scorer.
// 'deadBall' is a wicket that fell without a delivery being bowled at all — the
// non-striker run out backing up before release (Law 38.3). It goes in the book as
// a ball so the dismissal is recorded, but it is not one of the over's six.
const NON_BALL_EXTRAS = ['wide', 'noBall', 'penalty', 'retired', 'deadBall'];

// ── Match awards (MVP): Man of the Match, Fighter, Best Batter/Bowler/Fielder ──
// Computed from ball-by-ball data using the CricHeroes-style MVP algorithm.
// Everything computeAwards() needs: both squads plus the full ball-by-ball log.
// Shared by the awards endpoint and the post-match award notifications.
const loadMatchForAwards = (id) => prisma.match.findUnique({
  where: { id },
  include: {
    team1: true,
    team2: true,
    squads: { include: { player: { select: { name: true } } } },
    innings: {
      orderBy: { inningNumber: 'asc' },
      include: {
        battingTeam: { select: { name: true } },
        bowlingTeam: { select: { name: true } },
        oversData: {
          orderBy: { overNumber: 'asc' },
          include: {
            bowler: { select: { name: true } },
            // The ball's own bowler too: a shared over is balls with different
            // bowlerIds, and the MVP credits each delivery to whoever bowled it.
            balls: {
              orderBy: { ballNumber: 'asc' },
              include: { batter: { select: { name: true } }, bowler: { select: { name: true } } },
            },
          },
        },
      },
    },
  },
});

router.get('/:id/awards', async (req, res) => {
  try {
    const match = await loadMatchForAwards(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    const awards = computeAwards(match);
    // Backfill: matches that finished before the ledger existed have honours
    // nobody ever recorded. Opening a scorecard files them, so a career fills in
    // as old matches are looked at rather than needing a one-off script.
    if (match.status === 'completed' && !(await hasMatchAwards(match.id))) {
      await persistMatchAwards(match, awards).catch((e) => console.error('[awards backfill]', e.message));
    }
    res.json({ awards, result: match.result || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Scorer access control ─────────────────────────────────────────────────────
// Every scoring-mutation route must call this before writing: only the assigned
// scorer (the creator, by default) may proceed. Returns null (and has already
// sent the response) when the caller should stop; otherwise returns the match
// row so callers don't have to re-fetch it.
//
// Ownerless matches: new matches always get a scorer (POST / requires auth), so
// scorerId is only null on legacy rows created before that. Those are claimable
// by the first writer — a deliberate, narrow escape hatch so old matches stay
// scoreable. It is NOT a general "first come, first served" rule: it must never
// apply to a match that already has an owner.
async function assertScorer(req, res, matchId) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) { res.status(404).json({ error: 'Match not found' }); return null; }
  if (!req.user?.sub) { res.status(401).json({ error: 'Login required to score this match' }); return null; }
  if (!match.scorerId) {
    // Legacy claim: guard with a conditional update so two racing writers can't
    // both believe they won (updateMany matches only while scorerId is still null).
    const claimed = await prisma.match.updateMany({
      where: { id: matchId, scorerId: null },
      data: { scorerId: req.user.sub },
    });
    if (claimed.count === 0) {
      // someone claimed it first — re-read and fall through to the owner check
      const fresh = await prisma.match.findUnique({ where: { id: matchId }, select: { scorerId: true } });
      if (fresh?.scorerId !== req.user.sub) {
        res.status(403).json({ error: 'Only the assigned scorer can score this match', code: 'NOT_SCORER' });
        return null;
      }
    }
    match.scorerId = req.user.sub;
    return match;
  }
  if (match.scorerId !== req.user.sub) {
    res.status(403).json({ error: 'Only the assigned scorer can score this match', code: 'NOT_SCORER' });
    return null;
  }
  return match;
}

// ── Module 2: substitution, enforced per the sport's roster rules ────────────
// fixed → rejected (cricket), limited → capped (football 3–5), rolling →
// unlimited (basketball). Records to MatchSubstitution when allowed.
const SubSchema = z.object({
  sport:       z.string().default('cricket'),
  teamId:      z.string(),
  playerOutId: z.string(),
  playerInId:  z.string(),
  period:      z.string().optional(),
});
router.post('/:id/substitution', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const d = SubSchema.parse(req.body);
    const result = await applySubstitution({ matchId: req.params.id, ...d });
    if (!result.ok) return res.status(409).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/substitutions', async (req, res) => {
  try {
    const subs = await prisma.matchSubstitution.findMany({
      where: { matchId: req.params.id }, orderBy: { createdAt: 'asc' },
    });
    res.json({ substitutions: subs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  // Optional filters: ?sport=cricket  ?status=live
  const { sport, status } = req.query;
  const where = {};
  if (sport) where.sport = String(sport);
  if (status) where.status = String(status);
  const matches = await prisma.match.findMany({
    where,
    include: { team1: true, team2: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ matches });
});

// "From Your Circle" — matches involving the logged-in user's own world:
// teams they own or play for, plus teams they follow. Without this scope the
// feed would show every match in the database to every user.
router.get('/circle', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.sub;
    const { sport } = req.query;

    const [ownedOrPlaying, follows] = await Promise.all([
      prisma.team.findMany({
        where: { OR: [{ ownerId: uid }, { players: { some: { userId: uid } } }] },
        select: { id: true },
      }),
      prisma.teamFollow.findMany({ where: { userId: uid }, select: { teamId: true } }),
    ]);

    const teamIds = [...new Set([
      ...ownedOrPlaying.map((t) => t.id),
      ...follows.map((f) => f.teamId),
    ])];

    // Include matches this user is the scorer of (e.g. transferred to them) even if
    // they don't own/play/follow either team — so they can resume from My Matches.
    const or = [{ scorerId: uid }];
    if (teamIds.length) or.push({ team1Id: { in: teamIds } }, { team2Id: { in: teamIds } });

    const where = { OR: or };
    if (sport) where.sport = String(sport);

    const matches = await prisma.match.findMany({
      where,
      include: {
        team1: true, team2: true,
        // Just enough to compute a chase line ("NEED 45 off 30 balls") client-side
        // for the current (2nd) innings — not the full ball-by-ball log.
        innings: {
          orderBy: { inningNumber: 'desc' }, take: 1,
          include: {
            battingTeam: true,
            oversData: { select: { balls: { select: { extraType: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Server-authoritative "can this caller score it" flag. The client must NOT
    // derive this by comparing scorerId to a locally-cached user id — that cache
    // survives account switches, which showed the SCORE button to spectators.
    res.json({ matches: matches.map((m) => ({ ...m, isScorer: !!m.scorerId && m.scorerId === uid })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const MatchSchema = z.object({
  team1Id: z.string(),
  team2Id: z.string(),
  status: z.string().default('scheduled'),
  // Tidied here rather than in the handler so it cannot be written raw by a
  // future code path that forgets: "porur" and "Porur" are one ground, and a
  // blank becomes null instead of an empty-string venue.
  venue: z.string().optional().transform(canonicalVenue),
  matchType: z.string().optional(),
  startTime: z.string().datetime().optional(),
  overs: z.number().int().optional(),
  ballType: z.string().optional(),
  sport: z.string().default('cricket'),
});

// Creating a match requires login: the creator becomes the match's scorer, so an
// anonymous create would leave it ownerless and claimable by whoever scored first.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = MatchSchema.parse(req.body);

    // A match needs a squad: both teams must have at least one player.
    const [c1, c2, t1, t2] = await Promise.all([
      prisma.player.count({ where: { teamId: data.team1Id } }),
      prisma.player.count({ where: { teamId: data.team2Id } }),
      prisma.team.findUnique({ where: { id: data.team1Id }, select: { sport: true, name: true } }),
      prisma.team.findUnique({ where: { id: data.team2Id }, select: { sport: true, name: true } }),
    ]);
    if (c1 < 1 || c2 < 1) {
      return res.status(400).json({ error: 'Both teams need at least one player before a match can be created.' });
    }
    // Sport isolation: a match and both its teams must be the same sport.
    if (!t1 || !t2) return res.status(400).json({ error: 'Both teams must exist.' });
    if (t1.sport !== data.sport || t2.sport !== data.sport) {
      return res.status(400).json({ error: `Sport mismatch: a ${data.sport} match needs two ${data.sport} teams (got ${t1.name}: ${t1.sport}, ${t2.name}: ${t2.sport}).` });
    }

    // The creating user is recorded twice on purpose: createdBy is the permanent
    // record of who made the match, scorerId is the live scoring right and can be
    // transferred away later. authMiddleware guarantees req.user here.
    const match = await prisma.match.create({
      data: { ...data, currentInnings: 1, scorerId: req.user.sub, createdBy: req.user.sub }
    });

    if (data.sport === 'cricket') {
      await prisma.inning.create({
        data: {
          matchId: match.id,
          inningNumber: 1,
          battingTeamId: data.team1Id,
          bowlingTeamId: data.team2Id,
        }
      });
    }

    res.status(201).json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Cricket ball-by-ball scoring ────────────────────────────

const ScoreUpdateSchema = z.object({
  inningId: z.string(),
  overNumber: z.number().int(),
  ballNumber: z.number().int(),
  bowlerId: z.string(),
  batterId: z.string(),
  nonStrikerId: z.string(),
  runs: z.number().int().default(0),
  extras: z.number().int().default(0),
  extraType: z.string().optional().nullable(),
  isWicket: z.boolean().default(false),
  wicketType: z.string().optional().nullable(),
  dismissedPlayerId: z.string().optional().nullable(),
  wicketAssists: z.string().optional().nullable(),   // catcher / keeper / run-out fielder name
  // Run outs only. Absent means "not recorded", which is what every ball before
  // this column existed is — deliberately distinct from false.
  directHit:     z.boolean().optional().nullable(),
  // A catch put down off this delivery, and how hard it was. Not a wicket and
  // not scored by MVP — a record, so the commentary can say it happened.
  droppedBy:      z.string().max(60).optional().nullable(),
  dropDifficulty: z.enum(['easy', 'difficult']).optional().nullable(),
  clientEventId: z.string().optional().nullable(),   // offline idempotency key
});

router.put('/:id/score', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const data = ScoreUpdateSchema.parse(req.body);

    // Idempotency: if this exact delivery was already recorded (e.g. a retry
    // after a flaky offline flush), return it without re-incrementing tallies.
    if (data.clientEventId) {
      const dupe = await prisma.ball.findUnique({ where: { clientEventId: data.clientEventId } });
      if (dupe) return res.json({ success: true, ball: dupe, idempotent: true });
    }

    // ── Server-authoritative over placement ──────────────────────────────────
    // Append to the current over until it has 6 LEGAL balls (NON_BALL_EXTRAS —
    // wides, no-balls, penalties, retirements — do NOT count), then roll to a new
    // over. We do NOT trust the client's overNumber:
    // rapid taps during the async save repeat a stale overNumber, which was piling
    // many balls into one over (overs of 8–12 balls). The server owns the boundary.
    const isLegal = (b) => !NON_BALL_EXTRAS.includes(b.extraType);
    const legalCount = (o) => (o ? o.balls.filter(isLegal).length : 0);
    const latest = await prisma.over.findFirst({
      where: { inningId: data.inningId },
      orderBy: { overNumber: 'desc' },
      include: { balls: { orderBy: { ballNumber: 'asc' }, select: { extraType: true, bowlerId: true } } },
    });

    let over;
    if (latest && legalCount(latest) < 6) {
      over = latest;                       // current over still in progress → append.
                                           // A mid-over bowler change is simply a ball
                                           // with a different bowlerId in the same over.
    } else {
      // A new over starts → enforce the bowling laws (spell limit + no consecutive).
      const matchRow = await prisma.match.findUnique({ where: { id: req.params.id }, select: { overs: true } });
      const maxOvers = Math.ceil((matchRow?.overs || 20) / 5);   // T20 → 4, ODI → 10
      const priorOvers = await prisma.over.findMany({
        where: { inningId: data.inningId },
        include: { balls: { select: { extraType: true, bowlerId: true } } },
      });
      // Spell limit counted by ACTUAL deliveries bowled (shared overs split per bowler),
      // not by whole-over ownership. Per-ball bowlerId falls back to the over's bowler.
      let legalByBowler = 0;
      priorOvers.forEach((o) => o.balls.forEach((b) => {
        if (isLegal(b) && (b.bowlerId || o.bowlerId) === data.bowlerId) legalByBowler += 1;
      }));
      if (Math.floor(legalByBowler / 6) >= maxOvers) {
        return res.status(409).json({ error: `A bowler can bowl at most ${maxOvers} overs in this match.`, code: 'BOWLER_OVER_LIMIT' });
      }
      // No consecutive overs: the bowler of the LAST delivery of the previous over
      // can't open the next one (covers shared overs, not just Over.bowlerId).
      const lastBall = latest?.balls?.length ? latest.balls[latest.balls.length - 1] : null;
      const prevBowler = (lastBall && lastBall.bowlerId) || latest?.bowlerId;
      if (prevBowler && prevBowler === data.bowlerId) {
        return res.status(409).json({ error: 'A bowler cannot bowl two overs in a row.', code: 'BOWLER_CONSECUTIVE' });
      }
      over = await prisma.over.create({
        data: { inningId: data.inningId, overNumber: (latest?.overNumber || 0) + 1, bowlerId: data.bowlerId },
      });
    }

    // Ball number is assigned server-side (sequential within the over) so a stale
    // client can't cause collisions or gaps.
    const ballsInOver = await prisma.ball.count({ where: { overId: over.id } });

    const ball = await prisma.ball.create({
      data: {
        overId: over.id,
        clientEventId: data.clientEventId || undefined,
        ballNumber: ballsInOver + 1,
        batterId: data.batterId,
        nonStrikerId: data.nonStrikerId,
        bowlerId: data.bowlerId || undefined,   // per-delivery bowler (shared overs)
        runs: data.runs,
        extras: data.extras,
        extraType: data.extraType,
        isWicket: data.isWicket,
        wicketType: data.wicketType,
        dismissedPlayerId: data.dismissedPlayerId,
        wicketAssists: data.wicketAssists,
        directHit: data.directHit ?? null,
        droppedBy: data.droppedBy ?? null,
        dropDifficulty: data.dropDifficulty ?? null,
      }
    });

    await prisma.over.update({
      where: { id: over.id },
      data: {
        runs: { increment: data.runs },
        extras: { increment: data.extras },
        wickets: { increment: data.isWicket ? 1 : 0 },
      }
    });

    await prisma.inning.update({
      where: { id: data.inningId },
      data: {
        totalRuns: { increment: data.runs + data.extras },
        totalWickets: { increment: data.isWicket ? 1 : 0 },
      }
    });

    // Tell watching devices to refetch (coalesced) — replaces their polling.
    safeNotify(() => pingMatchWatchers(req.params.id));
    res.json({ success: true, ball });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Undo the last delivery of an inning — deletes the most recent ball and
// reverses its over/inning tallies (dropping the over if it's now empty).
// Transactional so a mis-tapped ball can be cleanly taken back on the ground.
router.delete('/:id/score/last', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { inningId } = req.query;
    if (!inningId) return res.status(400).json({ error: 'inningId required' });

    const result = await prisma.$transaction(async (tx) => {
      // Most recent over in the inning, then its highest-numbered ball.
      const lastOver = await tx.over.findFirst({
        where: { inningId: String(inningId) },
        orderBy: { overNumber: 'desc' },
        include: { balls: { orderBy: { ballNumber: 'desc' }, take: 1 } },
      });
      const ball = lastOver?.balls[0];
      if (!ball) return { empty: true };

      await tx.ball.delete({ where: { id: ball.id } });
      await tx.over.update({
        where: { id: lastOver.id },
        data: {
          runs:    { decrement: ball.runs },
          extras:  { decrement: ball.extras },
          wickets: { decrement: ball.isWicket ? 1 : 0 },
        },
      });
      await tx.inning.update({
        where: { id: String(inningId) },
        data: {
          totalRuns:    { decrement: ball.runs + ball.extras },
          totalWickets: { decrement: ball.isWicket ? 1 : 0 },
          // Put the crease back to whoever was actually facing this delivery. The
          // ball records the exact pair at the time it was bowled, so this is right
          // for every undo — but it MATTERS most for a wicket: the client persists
          // the crease on every change, so after "A out, B walks in" the inning still
          // pointed at B. Undoing the wicket removed A's dismissal without unseating
          // B, so the wicket count dropped while A simply vanished from the crease.
          // Note batterId is the FACING batter, not necessarily the dismissed one
          // (a run-out can remove the non-striker) — restoring both slots covers it.
          strikerId:    ball.batterId,
          nonStrikerId: ball.nonStrikerId,
          // Same reasoning for the bowler, so undoing back over an over boundary
          // returns the bowler who actually sent down that ball.
          ...(ball.bowlerId ? { currentBowlerId: ball.bowlerId } : {}),
        },
      });
      // If that was the only ball in the over, remove the empty over too.
      const remaining = await tx.ball.count({ where: { overId: lastOver.id } });
      if (remaining === 0) await tx.over.delete({ where: { id: lastOver.id } });

      return { ball };
    });

    if (result.empty) return res.status(404).json({ error: 'No ball to undo' });
    safeNotify(() => pingMatchWatchers(req.params.id));
    res.json({ success: true, undone: result.ball });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Accidental short run on the last delivery: one of the runs the batters ran
// wasn't grounded, so exactly ONE run is disallowed. Dock 1 from the ball, its
// over and the inning total. The delivery still counts (legal ball / wide /
// no-ball are unchanged) and the batters keep the ends they physically reached —
// strike is persisted separately via /crease, so it's not touched here. Tagged
// on the ball so it can't be applied twice.
const SHORT_RUN_TAG = 'Accidental Short Run';
router.put('/:id/score/last/short', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { inningId } = req.body || {};
    if (!inningId) return res.status(400).json({ error: 'inningId required' });

    const result = await prisma.$transaction(async (tx) => {
      const lastOver = await tx.over.findFirst({
        where: { inningId: String(inningId) },
        orderBy: { overNumber: 'desc' },
        include: { balls: { orderBy: { ballNumber: 'desc' }, take: 1 } },
      });
      const ball = lastOver?.balls[0];
      if (!ball) return { none: true };
      if (ball.wicketAssists === SHORT_RUN_TAG) return { already: true };
      if (ball.isWicket) return { ineligible: true };
      // Where the ran runs live: off the bat for a normal ball / no-ball; in
      // extras for wide/bye/leg-bye. Penalty/retired can't be short.
      const et = ball.extraType;
      const field = (!et || et === 'noBall') ? 'runs'
        : (et === 'wide' || et === 'bye' || et === 'legBye') ? 'extras' : null;
      if (!field) return { ineligible: true };
      // Runs actually RUN in the field we measure: a wide's 1-run penalty sits in
      // that same `extras`, so back it out; a no-ball's penalty is in `extras`
      // while we measure off-the-bat `runs`, so there's nothing to back out there.
      const penalty = et === 'wide' ? 1 : 0;
      const ran = ball[field] - penalty;
      if (ran < 2) return { ineligible: true };

      await tx.ball.update({ where: { id: ball.id }, data: { [field]: { decrement: 1 }, wicketAssists: SHORT_RUN_TAG } });
      await tx.over.update({ where: { id: lastOver.id }, data: { [field]: { decrement: 1 } } });
      await tx.inning.update({ where: { id: String(inningId) }, data: { totalRuns: { decrement: 1 } } });

      // This is the ONE path that changes a delivery's runs after it was stored,
      // so it is the one place a recorded shot's outcome can go stale: a shot
      // filed as 'Four' stays 'Four' while the ball becomes a 3, and the wagon
      // wheel then disagrees with the scorecard about the same delivery. Inside
      // the same transaction, so the runs and the label can never be half-updated.
      // updateMany, not update: most deliveries have no shot, and this must not
      // throw when there is nothing to correct.
      if (field === 'runs') {
        const runsAfter = ball.runs - 1;
        await tx.ballIntelligence.updateMany({
          where: { ballId: ball.id },
          data: { shotOutcome: shotOutcome({ ...ball, runs: runsAfter }) },
        });
      }
      return { ok: true, awarded: ran - 1 };
    });

    if (result.none) return res.status(404).json({ error: 'No ball to adjust' });
    if (result.already) return res.status(409).json({ error: 'This ball is already a short run' });
    if (result.ineligible) return res.status(400).json({ error: 'Short run does not apply to this delivery' });
    safeNotify(() => pingMatchWatchers(req.params.id));
    res.json({ success: true, awarded: result.awarded });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Ball Intelligence: where the ball went ───────────────────────────────────
//
// A SEPARATE call from the delivery on purpose. Shot capture is analytics layered
// over the scoring engine, and the scorer must never lose a ball because this
// half failed — so it is not part of PUT /score, cannot roll back a delivery, and
// cannot return an error that the scoring screen has to handle. The client sends
// it after the ball is safely stored and forgets about it.
//
// Addressed by `clientEventId` rather than the ball's own id: that is the key the
// client already minted for the delivery, so a shot queued on a dead network can
// be flushed later without the phone ever having learned the server-side ballId.
const ShotSchema = z.object({
  // One of these identifies the delivery. clientEventId is preferred (see above).
  clientEventId: z.string().optional(),
  ballId:        z.string().optional(),
  // Either a precise angle (dragged on the wheel) or a zone (one tap on a wedge).
  shotAngle:    z.number().optional(),
  shotZone:     z.string().optional(),
  shotDistance: z.number().optional(),
  shotType:       z.string().optional().nullable(),
  connectionType: z.string().optional().nullable(),
  source:     z.string().optional(),
  confidence: z.number().optional(),
});

/** Left-hander? `battingStyle` is free text the player typed, so read it loosely. */
const handOf = (player) =>
  /left/i.test(String(player?.battingStyle || '')) ? 'left' : 'right';

router.post('/:id/intelligence', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const data = ShotSchema.parse(req.body);
    if (!data.clientEventId && !data.ballId) {
      return res.status(400).json({ error: 'clientEventId or ballId required' });
    }

    // Load the delivery WITH its match, so a shot can never be written onto a
    // ball belonging to a different match than the one the caller is scoring.
    const ball = await prisma.ball.findFirst({
      where: data.clientEventId ? { clientEventId: data.clientEventId } : { id: data.ballId },
      include: {
        batter: { select: { id: true, name: true, battingStyle: true } },
        bowler: { select: { id: true, name: true } },
        over:   { select: { inningId: true, bowler: { select: { name: true } }, inning: { select: { matchId: true } } } },
      },
    });
    // Not an error the client should retry: an undone ball is simply gone, and the
    // queued shot for it should be dropped rather than resent forever.
    if (!ball) return res.status(404).json({ error: 'Delivery not found', code: 'BALL_GONE' });
    if (ball.over?.inning?.matchId !== req.params.id) {
      return res.status(403).json({ error: 'That delivery belongs to another match' });
    }

    const shot = normaliseShot(data, { hand: handOf(ball.batter) });
    if (!shot.ok) return res.status(400).json({ error: `Could not read the shot: ${shot.reason}` });

    // Outcome is derived from the delivery itself, never sent by the client, so
    // "Four" on the wagon wheel can't disagree with the 4 on the scorecard.
    const value = { ...shot.value, shotOutcome: shotOutcome(ball) };

    // Upsert: correcting a shot (section 21 — "4 Cover Drive" becomes "4 Cut
    // Point") overwrites the delivery's one record rather than adding a second.
    const intelligence = await prisma.ballIntelligence.upsert({
      where:  { ballId: ball.id },
      create: { ballId: ball.id, ...value },
      update: value,
    });

    const commentary = commentaryFor(ball, intelligence, {
      batter:  ball.batter?.name,
      bowler:  ball.bowler?.name || ball.over?.bowler?.name,
      fielder: ball.wicketAssists,
    });

    // A written line, for the few deliveries that earn one. Asked here — once,
    // at capture — and stored, because a spectator's screen refetches every six
    // seconds and generating on read would bill a call per viewer per ball.
    //
    // NOT awaited. The scorer's response must not wait on a model, and the
    // template line above is already a complete answer if this never lands.
    maybeStoreAiLine(prisma, {
      ball, shot: intelligence, matchId: req.params.id, fallback: commentary,
      facts: {
        batter: ball.batter?.name,
        bowler: ball.bowler?.name || ball.over?.bowler?.name,
        runs: ball.runs,
        isWicket: ball.isWicket,
        wicketType: ball.wicketType,
        fielder: ball.wicketAssists,
        shot: intelligence.shotType ? shotLabel(intelligence.shotType) : null,
        zone: zoneLabel(intelligence.shotZone),
      },
    }).catch(() => {});

    // Same nudge the delivery itself sends — spectators refetch and pick up the
    // shot, the wheel and the line together.
    safeNotify(() => pingMatchWatchers(req.params.id));
    res.json({ success: true, intelligence, commentary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Everything captured in this match: the wagon wheel, the match summary, and the
// spectator's live shot all read from here. Public — a spectator is not a scorer.
router.get('/:id/intelligence', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { id: true, ballIntelligenceEnabled: true },
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const { playerId, inningId } = req.query;
    const rows = await prisma.ballIntelligence.findMany({
      where: {
        ball: {
          over: { inning: { matchId: req.params.id, ...(inningId ? { id: String(inningId) } : {}) } },
          ...(playerId ? { batterId: String(playerId) } : {}),
        },
      },
      // Sorted below by where the ball sits in the innings, NOT by this. A shot
      // is created when the scorer answers, which is not when the ball was
      // bowled: an offline backlog flushes in a burst, and a shot corrected via
      // SHOT keeps its original createdAt. Ordering the wheel — and especially
      // `latest`, which a spectator reads as "the ball that just happened" — by
      // capture time would eventually show the wrong delivery as the live one.
      include: {
        ball: {
          select: {
            id: true, runs: true, extras: true, extraType: true, isWicket: true, ballNumber: true,
            // The rest are for the commentary line below, not for the wheel.
            wicketType: true, wicketAssists: true, droppedBy: true, dropDifficulty: true,
            batter: { select: { id: true, name: true, battingStyle: true } },
            bowler: { select: { id: true, name: true } },
            over:   {
              select: {
                overNumber: true, inningId: true,
                bowler: { select: { name: true } },
                inning: { select: { inningNumber: true, battingTeam: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    // ── Payload weight ────────────────────────────────────────────────────────
    // This endpoint is POLLED every six seconds by every spectator, for the whole
    // match, and the list only grows. So it ships the minimum a wagon wheel needs
    // to draw a dot — angle, distance, runs, wicket, which innings — and nothing
    // else. A fully tracked T20 is 240 deliveries; sending the batter's name, the
    // bowler's name, the over, the zone and a commentary sentence on every one of
    // them, 1800 times, is over a hundred megabytes per viewer of data that is
    // read once or never.
    //
    // Everything rich lives on `latest`, which is the one shot actually rendered
    // in words. `?detail=full` restores the old fat rows for any consumer that
    // genuinely needs them.
    const full = String(req.query.detail || '') === 'full';

    const slim = (r) => ({
      id: r.id,
      angle: r.shotAngle,
      distance: r.shotDistance,
      runs: r.ball?.runs ?? 0,
      isWicket: !!r.ball?.isWicket,
      inningId: r.ball?.over?.inningId ?? null,
    });

    // Flattened for drawing: the client should not have to walk three relations
    // to plot one dot on a wheel.
    //
    // The zone is RE-DERIVED here rather than read back from the column. A zone
    // name is a function of (angle, batter's hand), and the hand is a mutable
    // property of the player — most players in this database have no batting
    // style recorded at all, so they default to right-handed, and the day
    // someone fills in "Left Hand Bat" every shot they had already played would
    // otherwise keep its right-handed name forever. The stored column is a
    // write-time cache for SQL aggregation; THIS is the answer.
    // Innings order, then over, then ball — the order they were actually bowled.
    const inPlayOrder = [...rows].sort((a, b) =>
      (a.ball?.over?.inning?.inningNumber ?? 0) - (b.ball?.over?.inning?.inningNumber ?? 0)
      || (a.ball?.over?.overNumber ?? 0) - (b.ball?.over?.overNumber ?? 0)
      || (a.ball?.ballNumber ?? 0) - (b.ball?.ballNumber ?? 0));

    /** Everything about one shot. Used for `latest`, and for ?detail=full. */
    const rich = (r) => ({
      ...slim(r),
      ballId: r.ballId,
      zone: zoneFromAngle(r.shotAngle, handOf(r.ball?.batter)),
      shotType: r.shotType,
      outcome: r.shotOutcome,
      connection: r.connectionType,
      source: r.source,
      over: r.ball?.over?.overNumber ?? null,
      ballNumber: r.ball?.ballNumber ?? null,
      inningNumber: r.ball?.over?.inning?.inningNumber ?? null,
      batterId: r.ball?.batter?.id ?? null,
      batter: r.ball?.batter?.name ?? null,
      batterHand: handOf(r.ball?.batter),
      bowlerId: r.ball?.bowler?.id ?? null,
      bowler: r.ball?.bowler?.name ?? null,
      // The written line if this delivery earned one, otherwise the template
      // composed on read. The template costs a string format, is always
      // consistent with the delivery as it stands NOW (a corrected shot or an
      // applied short run changes it), and needs no model call — which is why
      // it, not the model, is what every ordinary ball gets.
      commentary: r.aiCommentary || commentaryFor(r.ball, r, {
        batter:  r.ball?.batter?.name,
        bowler:  r.ball?.bowler?.name || r.ball?.over?.bowler?.name,
        fielder: r.ball?.wicketAssists,
      }),
      // So a UI can mark the difference honestly if it wants to.
      commentarySource: r.aiCommentary ? 'ai' : 'template',
    });

    const shots = inPlayOrder.map(full ? rich : slim);

    // The summaries need zone and shot type, which the slim rows deliberately do
    // not carry. Computed here and SENT ONLY AS TOTALS — the client gets the
    // rolled-up scoring areas, never the per-ball fields they were rolled up
    // from. That is the whole point: aggregate once on the server rather than
    // ship the raw material for it to every viewer, every six seconds.
    const forStats = inPlayOrder.map((r) => ({
      zone: zoneFromAngle(r.shotAngle, handOf(r.ball?.batter)),
      shotType: r.shotType,
      runs: r.ball?.runs ?? 0,
      isWicket: !!r.ball?.isWicket,
      inningId: r.ball?.over?.inningId ?? null,
    }));

    // The summary rides along rather than living at its own URL: every screen
    // that draws the wheel also wants the totals under it, and splitting them
    // would mean two round trips on a spectator's phone to render one card.
    // Which innings are represented, and what to call them.
    //
    // A match wheel that plots both innings on one circle is two teams' batting
    // drawn on top of each other, and "scoring areas" computed across both is a
    // statistic about nobody. The client needs to be able to separate them
    // WITHOUT a second request — a spectator switching innings should not wait
    // on the network — so the shots carry their innings and this names them.
    const inningsSeen = [];
    for (const r of inPlayOrder) {
      const id = r.ball?.over?.inningId;
      if (!id || inningsSeen.some((i) => i.id === id)) continue;
      inningsSeen.push({
        id,
        number: r.ball?.over?.inning?.inningNumber ?? null,
        battingTeam: r.ball?.over?.inning?.battingTeam?.name || null,
      });
    }
    inningsSeen.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    // Per-innings summaries, so each one's scoring areas are its own. The
    // whole-match summary stays for callers that genuinely want the aggregate.
    const byInnings = inningsSeen.map((inn) => ({
      ...inn,
      summary: matchShotSummary(forStats.filter((s) => s.inningId === inn.id)),
    }));

    res.json({
      enabled: match.ballIntelligenceEnabled,
      count: shots.length,
      shots,
      innings: inningsSeen,
      byInnings,
      summary: matchShotSummary(forStats),
      // The last delivery BOWLED — the list is in play order, not capture order.
      // ALWAYS rich, whatever the rest of the list is: this is the one shot that
      // gets rendered in words, and it is a single object, so its weight is
      // irrelevant next to the 240 behind it.
      latest: inPlayOrder.length ? rich(inPlayOrder[inPlayOrder.length - 1]) : null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Scorer info + transfer ───────────────────────────────────────────────────
// Who can score, and the registered users in the match squad you can hand it to.
router.get('/:id/scorer', authMiddleware, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { scorerId: true } });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    const squad = await prisma.matchPlayer.findMany({
      where: { matchId: req.params.id },
      include: {
        team: { select: { id: true, name: true } },
        player: { select: { userId: true, name: true, user: { select: { avatarUrl: true } } } },
      },
    });
    // De-dupe registered users in the squad (exclude the current scorer).
    const seen = new Set();
    const candidates = [];
    let scorerName = '';
    let scorerTeamId = null;
    for (const s of squad) {
      const uid = s.player?.userId;
      if (uid === match.scorerId) { scorerName = s.player.name; scorerTeamId = s.teamId; }
      if (uid && uid !== match.scorerId && !seen.has(uid)) {
        seen.add(uid);
        candidates.push({
          userId: uid,
          name: s.player.name,
          // The break screen groups by side and leads with the opponent, so it
          // needs to know which team each name is on and who has a photo.
          teamId: s.teamId,
          teamName: s.team?.name || null,
          avatarUrl: s.player.user?.avatarUrl || null,
        });
      }
    }
    // Handing over at the innings break normally means handing to the side that
    // is about to field, so their players come first. A dedicated scorer is in
    // neither squad — then there's no opponent and the order is left alone.
    for (const c of candidates) c.isOpponent = scorerTeamId ? c.teamId !== scorerTeamId : false;
    candidates.sort((a, b) => (b.isOpponent - a.isOpponent) || a.name.localeCompare(b.name));
    // Fall back to the User's name if the scorer isn't in the squad as a linked player.
    if (!scorerName && match.scorerId) {
      const u = await prisma.user.findUnique({ where: { id: match.scorerId }, select: { firstName: true, lastName: true } });
      if (u) scorerName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    }
    res.json({ scorerId: match.scorerId, scorerName, isScorer: match.scorerId === req.user.sub, candidates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /matches/:id/scorer  { scorerId }  — only the current scorer can hand it over.
router.put('/:id/scorer', authMiddleware, async (req, res) => {
  try {
    const { scorerId } = req.body || {};
    if (!scorerId) return res.status(400).json({ error: 'scorerId required' });
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { scorerId: true } });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    // If a scorer is set, only they may transfer; unassigned matches can be claimed.
    if (match.scorerId && match.scorerId !== req.user.sub) {
      return res.status(403).json({ error: 'Only the current scorer can transfer scoring' });
    }
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: { scorerId },
      include: { team1: { select: { name: true } }, team2: { select: { name: true } } },
    });
    // Otherwise the book has changed hands and the person now holding it has no
    // idea. Best-effort: the transfer itself has already happened.
    await safeNotify(() => notifyUsers([scorerId], {
      type: 'match',
      title: "You're scoring",
      message: `You've been handed the scoring for ${updated.team1?.name || 'Team 1'} v ${updated.team2?.name || 'Team 2'}.`,
      data: { matchId: req.params.id },
    }));
    res.json({ success: true, scorerId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Add a player to a live match's squad (from the team's full roster) ────────
// Lets a scorer pull in a squad member mid-match when the playing XI runs short
// or someone was missed at the toss. Idempotent (unique [matchId, playerId]).
router.post('/:id/squad', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { playerId, teamId } = req.body || {};
    if (!playerId || !teamId) return res.status(400).json({ error: 'playerId and teamId required' });
    const mp = await prisma.matchPlayer.upsert({
      where: { matchId_playerId: { matchId: req.params.id, playerId } },
      create: { matchId: req.params.id, teamId, playerId },
      update: {},
      include: { player: true },
    });
    res.json({ success: true, player: { id: mp.playerId, name: mp.player.name } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Persist the live crease + bowler (player IDs) on the inning ──────────────
// Called by the scorer whenever the pair at the wicket or the bowler changes
// (opening selection, strike rotation, new batter, new bowler) so a resumed match
// restores them exactly — even before the first ball of an over/innings is bowled.
router.put('/:id/crease', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { inningId, strikerId, nonStrikerId, currentBowlerId } = req.body || {};
    if (!inningId) return res.status(400).json({ error: 'inningId required' });
    await prisma.inning.update({
      where: { id: inningId },
      data: {
        strikerId: strikerId || null,
        nonStrikerId: nonStrikerId || null,
        currentBowlerId: currentBowlerId || null,
      },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Module 7: resume-state projection (crash recovery + device handoff) ──────
// Rebuilds the exact live scoring state from the ball log so a new device (dead
// battery) or a reopened app can continue a cricket match seamlessly — striker,
// non-striker, current bowler, over.ball, score, target — no local state needed.
router.get('/:id/live-state', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (match.sport !== 'cricket') {
      // Non-cricket: the derived score + events are enough to resume.
      const events = await prisma.sportEvent.findMany({ where: { matchId: match.id }, orderBy: { createdAt: 'asc' } });
      return res.json({ sport: match.sport, status: match.status, score1: match.score1, score2: match.score2, eventCount: events.length });
    }

    const innings = await prisma.inning.findMany({
      where: { matchId: match.id }, orderBy: { inningNumber: 'asc' },
      include: {
        battingTeam: true, bowlingTeam: true,
        oversData: {
          orderBy: { overNumber: 'desc' },
          include: {
            bowler: { include: { user: { select: { avatarUrl: true } } } },
            balls: {
              orderBy: { ballNumber: 'desc' },
              include: {
                batter: { include: { user: { select: { avatarUrl: true } } } },
                nonStriker: { include: { user: { select: { avatarUrl: true } } } },
                bowler: { include: { user: { select: { avatarUrl: true } } } },
              },
            },
          },
        },
      },
    });
    const inning = innings[innings.length - 1];
    if (!inning) return res.json({ sport: 'cricket', status: match.status, resumable: false });

    const legalB = (b) => !NON_BALL_EXTRAS.includes(b.extraType);
    const legalIn = (over) => (over.balls || []).filter(legalB).length;
    // Per-bowler completed overs from ACTUAL deliveries (shared overs count per
    // bowler = legal balls / 6) → enforces the spell limit on resume;
    // lastOverBowlerId (the last delivery's bowler) powers the no-consecutive rule.
    const bowlerLegalBalls = {};
    let lastOverBowlerId = null;
    for (const ov of [...inning.oversData].sort((a, b) => a.overNumber - b.overNumber)) {
      const complete = legalIn(ov) >= 6;
      for (const b of (ov.balls || [])) {
        const bId = b.bowlerId || ov.bowlerId;
        if (bId && legalB(b)) bowlerLegalBalls[bId] = (bowlerLegalBalls[bId] || 0) + 1;
      }
      if (complete && ov.balls?.length) {
        const last = [...ov.balls].sort((a, b) => a.ballNumber - b.ballNumber).slice(-1)[0];
        lastOverBowlerId = (last && last.bowlerId) || ov.bowlerId;
      }
    }
    const bowlerOvers = Object.fromEntries(
      Object.entries(bowlerLegalBalls).map(([id, n]) => [id, Math.floor(n / 6)])
    );

    const curOver = inning.oversData[0];               // latest over of the current inning
    const lastBall = curOver?.balls[0];                // most recent delivery
    const legalThisOver = curOver ? legalIn(curOver) : 0;
    const overComplete = legalThisOver >= 6;
    const completedOvers = overComplete ? curOver.overNumber : (curOver ? curOver.overNumber - 1 : 0);
    const ballInOver = overComplete ? 0 : legalThisOver;

    // Squads (playing XIs) split by the current inning's batting/bowling team,
    // so the resumed scorer keeps the same player pickers.
    const squad = await prisma.matchPlayer.findMany({ where: { matchId: match.id }, include: { player: { include: { user: { select: { avatarUrl: true } } } } } });
    // role rides along so a resumed scorer can still spot the keeper (caught behind).
    // battingStyle rides along so a RESUMED scorer still gets a left-hander's
    // wagon wheel drawn the right way round — it is the only field that decides
    // which way the wheel's labels mirror.
    const xiFor = (teamId) => squad.filter((s) => s.teamId === teamId).map((s) => ({ id: s.player.id, name: s.player.name, role: s.player.role, battingStyle: s.player.battingStyle, avatarUrl: s.player.user?.avatarUrl || null }));

    // Notation for the balls already in the current over (to rebuild the log).
    // Must mirror the client's own over-strip strings EXACTLY (ScoringScreen's
    // newOver.push): an extra with runs run keeps its total (wide+2 → "3wd",
    // no-ball+3 → "4nb", bye+2 → "2b", leg-bye+2 → "2lb") so the resumed strip —
    // and the "THIS OVER · N runs" tally the client parses off it — matches what
    // was scored live instead of collapsing every extra to a bare "WD"/"B".
    // Mirrors ballChip() in frontend/src/utils/runOutEngine.js — a wicket is written
    // onto the delivery that took it ('WD+W', '3nb+W', '2+W'), because a run out can
    // arrive on ANY delivery and the strip must show both halves of what happened.
    const notate = (b) => {
      const w = b.isWicket ? '+W' : '';
      if (b.extraType === 'wide')    return (b.extras > 1 ? `${b.extras}wd` : 'WD') + w;
      if (b.extraType === 'noBall')  { const t = b.runs + b.extras; return (t > 1 ? `${t}nb` : 'NB') + w; }
      if (b.extraType === 'bye')     return (b.extras > 1 ? `${b.extras}b` : 'B') + w;
      if (b.extraType === 'legBye')  return (b.extras > 1 ? `${b.extras}lb` : 'LB') + w;
      if (b.extraType === 'penalty') return 'P5';
      if (b.extraType === 'deadBall') return 'W';        // no delivery — only ever a wicket
      if (b.isWicket) return b.runs > 0 ? `${b.runs}+W` : 'W';
      return b.runs === 0 ? '·' : String(b.runs);
    };
    const currentOverBalls = overComplete ? [] : [...(curOver?.balls || [])].reverse().map(notate);

    // Resolve the persisted crease/bowler names. Look them up directly (not only
    // in the squad) so it works even if the playing XI wasn't fully recorded.
    const creaseIds = [inning.strikerId, inning.nonStrikerId, inning.currentBowlerId].filter(Boolean);
    const creasePlayers = creaseIds.length
      ? await prisma.player.findMany({ where: { id: { in: creaseIds } }, select: { id: true, name: true, battingStyle: true, user: { select: { avatarUrl: true } } } })
      : [];
    const nameFor = (pid) => {
      if (!pid) return null;
      const p = creasePlayers.find((x) => x.id === pid) || squad.find((s) => s.player.id === pid)?.player;
      return p ? { id: pid, name: p.name, battingStyle: p.battingStyle || null, avatarUrl: p.user?.avatarUrl || null } : null;
    };
    // Everyone dismissed this innings — computed up front so a batter who is OUT
    // is never seated at the crease, even if a persisted strikerId/nonStrikerId
    // still points at them (e.g. the app was reloaded between the wicket and
    // picking the replacement). A rejected slot resolves to null → needsNewBatter,
    // so the scorer is asked to pick the correct incoming batter.
    const outThisInnings = new Set();
    for (const ov of inning.oversData) for (const b of (ov.balls || [])) {
      if (b.isWicket && b.dismissedPlayerId) outThisInnings.add(b.dismissedPlayerId);
    }
    const notOut = (c) => (c && !outThisInnings.has(c.id)) ? c : null;

    const fbStriker = lastBall && !lastBall.isWicket ? { id: lastBall.batter.id, name: lastBall.batter.name, battingStyle: lastBall.batter.battingStyle || null, avatarUrl: lastBall.batter.user?.avatarUrl || null } : null;
    const fbNon = lastBall ? { id: lastBall.nonStriker.id, name: lastBall.nonStriker.name, battingStyle: lastBall.nonStriker.battingStyle || null, avatarUrl: lastBall.nonStriker.user?.avatarUrl || null } : null;
    const fbBowler = overComplete ? null : (curOver?.bowler ? { id: curOver.bowler.id, name: curOver.bowler.name, avatarUrl: curOver.bowler.user?.avatarUrl || null } : null);
    // Resolve each slot from its persisted id first; only fall back to the last
    // ball's pair if that id is missing or points at a dismissed batter.
    const primaryStriker = notOut(nameFor(inning.strikerId));
    const primaryNon = notOut(nameFor(inning.nonStrikerId));
    let creaseStriker = primaryStriker || notOut(fbStriker);
    let creaseNonStriker = primaryNon || notOut(fbNon);
    // A batter can't stand at both ends. This collides when one slot's persisted
    // id resolves to a dismissed player (rejected above) and the fallback then
    // lands on the OTHER slot's batter — seating the same person twice, which read
    // as "the dismissed batter vanished and got replaced by a duplicate of their
    // partner." Drop the FALLBACK-derived slot to null so the scorer is asked to
    // pick the real incoming batter instead of showing a phantom duplicate.
    if (creaseStriker && creaseNonStriker && creaseStriker.id === creaseNonStriker.id) {
      if (!primaryStriker) creaseStriker = null;         // striker came from the fallback
      else if (!primaryNon) creaseNonStriker = null;     // non-striker came from the fallback
      else creaseNonStriker = null;                      // both persisted ids equal (bad data)
    }
    const creaseBowler = nameFor(inning.currentBowlerId) || fbBowler;

    // Per-player figures for resume: striker runs/balls and bowler O-M-R-W.
    // Runs "charged" to the bowler = bat runs + wides + no-ball penalty; byes/leg-
    // byes/penalty aren't charged. A maiden = a completed over with 0 charged runs.
    const battingFigures = {};
    const bowlingFigures = {};
    const ensureBowler = (id) => { if (id && !bowlingFigures[id]) bowlingFigures[id] = { balls: 0, runs: 0, wickets: 0, maidens: 0 }; };
    const dismissedBatters = new Set();   // players out this innings → can't re-bat
    for (const ov of inning.oversData) {
      let overCharged = 0, overLegal = 0;
      const overBowlers = new Set();      // distinct bowlers in this over (for maidens)
      for (const b of ov.balls) {
        const bId = b.bowlerId || ov.bowlerId;   // per-delivery bowler (shared overs)
        const et = b.extraType;
        if (b.batterId) {
          if (!battingFigures[b.batterId]) battingFigures[b.batterId] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
          if (et !== 'wide' && et !== 'penalty' && et !== 'retired') battingFigures[b.batterId].balls += 1;  // faced
          if (!et || et === 'noBall') {                                                   // runs off the bat
            battingFigures[b.batterId].runs += b.runs;
            if (b.runs === 4) battingFigures[b.batterId].fours += 1;
            if (b.runs === 6) battingFigures[b.batterId].sixes += 1;
          }
        }
        let charged = 0, legal = false;
        if (et === 'wide') charged = b.extras;
        else if (et === 'noBall') charged = b.runs + b.extras;
        else if (et === 'bye' || et === 'legBye') legal = true;   // charged 0
        else if (et === 'penalty' || et === 'retired') charged = 0; // not a delivery
        else { charged = b.runs; legal = true; }                  // normal delivery / wicket
        overCharged += charged;
        if (legal) overLegal += 1;
        if (bId) {
          ensureBowler(bId);
          overBowlers.add(bId);
          bowlingFigures[bId].runs += charged;
          if (legal) bowlingFigures[bId].balls += 1;
          if (b.isWicket) {
            const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
            if (wt !== 'runout' && wt !== 'retired') bowlingFigures[bId].wickets += 1;
          }
        }
        if (b.isWicket && b.dismissedPlayerId) dismissedBatters.add(b.dismissedPlayerId);
      }
      // A maiden needs one bowler to bowl the whole (6-legal) over for 0 charged runs.
      if (overLegal >= 6 && overCharged === 0 && overBowlers.size === 1) {
        bowlingFigures[[...overBowlers][0]].maidens += 1;
      }
    }

    res.json({
      sport: 'cricket',
      status: match.status,
      resumable: true,
      matchId: match.id,
      team1: match.team1Id, team2: match.team2Id,
      totalOvers: match.overs || 20,
      // Rides along on resume so a scorer who reopens the app mid-match gets the
      // shot prompt back — the flag lives on the match, not in the phone.
      ballIntelligenceEnabled: match.ballIntelligenceEnabled,
      inningId: inning.id,
      inningNumber: inning.inningNumber,
      isInnings2: inning.inningNumber === 2,
      battingTeamId: inning.battingTeamId,
      bowlingTeamId: inning.bowlingTeamId,
      battingTeam: inning.battingTeam?.name,
      bowlingTeam: inning.bowlingTeam?.name,
      battingXI: xiFor(inning.battingTeamId),
      bowlingXI: xiFor(inning.bowlingTeamId),
      score: `${inning.totalRuns}/${inning.totalWickets}`,
      totalRuns: inning.totalRuns,
      wickets: inning.totalWickets,
      completedOvers, ballInOver, currentOverBalls,
      overs: `${completedOvers}.${ballInOver}`,
      target: inning.targetScore || null,
      // The pair at the crease + the bowler → rehydrate the UI exactly. Prefer the
      // persisted crease (survives resume even before a ball is bowled); fall back
      // to the last-ball derivation for matches saved before crease persistence.
      striker: creaseStriker,
      nonStriker: creaseNonStriker,
      bowler: creaseBowler,
      needsNewBatter: !creaseStriker,
      needsNewBowler: !creaseBowler,
      bowlerOvers, lastOverBowlerId,
      battingFigures, bowlingFigures,
      dismissedBatters: [...dismissedBatters],
      lastBall: lastBall ? { runs: lastBall.runs, extras: lastBall.extras, extraType: lastBall.extraType, isWicket: lastBall.isWicket } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /:id/live-summary — the headline score, small and cacheable.
 *
 * The same `liveSummary` the broadcast overlay renders, so the score a
 * spectator reads in the app and the score burned into the video are produced
 * by one function and cannot drift apart. Public: a live score is public.
 *
 * Exists separately from /scorecard because the app polls this every few
 * seconds from a cricket ground on mobile data, and /scorecard carries every
 * delivery of the match plus both full rosters. Fetch that when someone opens
 * a tab that needs it, not on a timer.
 */
router.get('/:id/live-summary', async (req, res) => {
  try {
    const summary = await liveSummary(req.params.id);
    if (!summary) return res.status(404).json({ error: 'Match not found' });
    const live = summary.status === 'live' || summary.status === 'break';
    res.set('Cache-Control', live
      ? 'public, s-maxage=2, stale-while-revalidate=8'
      : 'public, s-maxage=30');
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/scorecard', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        // Full roster (not just the match squad) so the Squads tab can show a
        // "Bench" section — team members named for this match but not selected.
        // With their photo: the squad rows above render an avatar from
        // player.user.avatarUrl, and the bench came back without the relation,
        // so every bench player fell back to initials even when they had one.
        team1: { include: { players: { include: { user: { select: { avatarUrl: true } } } } } },
        team2: { include: { players: { include: { user: { select: { avatarUrl: true } } } } } },
        squads: { include: { player: { include: { user: { select: { avatarUrl: true } } } } } },
        innings: {
          include: {
            battingTeam: true,
            bowlingTeam: true,
            oversData: {
              include: {
                bowler: true,
                balls: {
                  include: { batter: true, nonStriker: true, bowler: { select: { id: true, name: true } } },
                  orderBy: { ballNumber: 'asc' }
                }
              },
              orderBy: { overNumber: 'asc' }
            }
          },
          orderBy: { inningNumber: 'asc' }
        }
      }
    });

    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { status, score1, score2, result, currentInnings, ballIntelligenceEnabled } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(score1 !== undefined && { score1 }),
        ...(score2 !== undefined && { score2 }),
        ...(result && { result }),
        ...(currentInnings && { currentInnings }),
        // Turning shot capture on or off part-way through is allowed and keeps
        // whatever was already recorded — a scorer who gives up on it at the
        // innings break should not lose the first innings' wagon wheel.
        ...(typeof ballIntelligenceEnabled === 'boolean' && { ballIntelligenceEnabled }),
      },
    });
    // On completion: post a match-result card + detect career milestones (which
    // also inject milestone cards). Inline because serverless suspends work
    // after the response; guarded so neither can fail the completion.
    if (status === 'completed') {
      await pushMatchResultCard(match).catch(() => {});
      await checkMatchMilestones(match.id);
      // Awards are FILED first, before anything downstream reads them. They used
      // to be computed for the push notification and then thrown away, which is
      // why no profile has ever shown a Man of the Match. And if this was a
      // tournament's last fixture, the report below crowns a Player of the
      // Series by summing this ledger — so the deciding match has to be in it.
      const full = await loadMatchForAwards(match.id);
      const awards = full ? computeAwards(full) : null;
      if (full) await persistMatchAwards(full, awards).catch((e) => console.error('[awards]', e.message));
      // If this match is a tournament fixture, auto-finalize it (score → standings
      // → bracket → honours → notifications). Guarded so it can't fail the completion.
      await reportMatchToTournament(match).catch((e) => console.error('[tournament report]', e.message));
      // Result + award notifications: winners get a personal "you won X" card,
      // the rest of both teams' circles get the round-up.
      if (full) await safeNotify(() => notifyMatchResult(full, awards));
    }
    res.json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Toss + playing XI (one transactional call from the Toss & Lineup screen) ──
// Fixes the whole pre-match state: records the toss, corrects inning 1's
// batting/bowling teams (created at match time as "team1 bats"), and persists
// both playing XIs to MatchPlayer (previously never written — squads were
// always empty on the scorecard).
// ── Match setup for non-cricket sports ───────────────────────────────────────
// Cricket's /toss is bat-or-bowl shaped (it has to set the innings' batting and
// bowling sides). Every other sport still needs the same two real things before
// kick-off: who won the coin toss, and each side's squad — without which goals
// and cards can't be attributed to anyone. This is that, sport-agnostic:
// `choice` is free text ('kickoff', 'ends', …) rather than a bat/bowl enum.
const SetupSchema = z.object({
  tossWinnerId: z.string().optional(),
  choice:       z.string().optional(),
  squads: z.array(SquadSchema).min(1),
});

router.post('/:id/setup', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const data = SetupSchema.parse(req.body);
    const matchId = req.params.id;

    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'live',
          ...(data.tossWinnerId ? { tossWinnerId: data.tossWinnerId } : {}),
          ...(data.choice ? { tossDecision: data.choice } : {}),
        },
      });
      // Re-submitting setup replaces the squads rather than appending, so a
      // corrected line-up doesn't leave the old XI attached to the match.
      await tx.matchPlayer.deleteMany({ where: { matchId } });
      await tx.matchPlayer.createMany({ data: squadRows(matchId, data.squads), skipDuplicates: true });
      return m;
    });

    // Same as the cricket toss: this is what puts the match on air.
    await safeNotify(async () => {
      const full = await prisma.match.findUnique({
        where: { id: matchId },
        include: { team1: { select: { name: true } }, team2: { select: { name: true } } },
      });
      return full ? notifyMatchLive(full, { exclude: [req.user.sub] }) : 0;
    });

    res.json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const TossSchema = z.object({
  tossWinnerId:  z.string(),
  tossDecision:  z.enum(['bat', 'bowl']),
  battingTeamId: z.string(),
  bowlingTeamId: z.string(),
  squads: z.array(SquadSchema).optional(),
  // Opt in to shot capture for THIS match. Optional so an older app build — which
  // knows nothing about it — submits a toss exactly as it always has and gets a
  // match with the feature off, rather than a 400.
  ballIntelligenceEnabled: z.boolean().optional(),
});

router.post('/:id/toss', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const data = TossSchema.parse(req.body);
    const matchId = req.params.id;

    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.match.update({
        where: { id: matchId },
        data: {
          tossWinnerId: data.tossWinnerId,
          tossDecision: data.tossDecision,
          status: 'live',
          // A toss (re)submission means innings are starting fresh from here —
          // clear any score/result left over from an earlier attempt on this
          // same match (e.g. a redo), otherwise a stale score1/score2 from the
          // prior toss keeps showing on the Scorecard for a team that hasn't
          // actually batted yet under the current toss.
          score1: null, score2: null, result: null,
          currentInnings: 1,
          ...(data.ballIntelligenceEnabled !== undefined
            ? { ballIntelligenceEnabled: data.ballIntelligenceEnabled }
            : {}),
        },
      });
      // A toss (re)submission means ball-by-ball play starts fresh from here too —
      // wipe any overs/balls (and any 2nd+ innings) left over from an earlier
      // attempt on this same match, not just relabel inning 1. Otherwise stale
      // deliveries (with a different batting lineup) stay attached to inning 1
      // and leak into the new scorecard alongside the real current batters.
      const staleInnings = await tx.inning.findMany({ where: { matchId }, select: { id: true } });
      const staleInningIds = staleInnings.map((i) => i.id);
      if (staleInningIds.length) {
        const staleOvers = await tx.over.findMany({ where: { inningId: { in: staleInningIds } }, select: { id: true } });
        const staleOverIds = staleOvers.map((o) => o.id);
        if (staleOverIds.length) await tx.ball.deleteMany({ where: { overId: { in: staleOverIds } } });
        await tx.over.deleteMany({ where: { inningId: { in: staleInningIds } } });
      }
      await tx.inning.deleteMany({ where: { matchId, inningNumber: { not: 1 } } });
      await tx.inning.updateMany({
        where: { matchId, inningNumber: 1 },
        data: {
          battingTeamId: data.battingTeamId, bowlingTeamId: data.bowlingTeamId,
          totalRuns: 0, totalWickets: 0, totalOvers: 0, extras: null,
          strikerId: null, nonStrikerId: null, currentBowlerId: null,
        },
      });
      if (data.squads?.length) {
        await tx.matchPlayer.deleteMany({ where: { matchId } });
        await tx.matchPlayer.createMany({ data: squadRows(matchId, data.squads), skipDuplicates: true });
      }
      return m;
    });

    // The toss is what puts a match on air — tell both teams' circles it's live.
    // The scorer already knows, so they're left out.
    await safeNotify(async () => {
      const full = await prisma.match.findUnique({
        where: { id: matchId },
        include: { team1: { select: { name: true } }, team2: { select: { name: true } } },
      });
      return full ? notifyMatchLive(full, { exclude: [req.user.sub] }) : 0;
    });

    res.json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// The gloves change hands mid-innings — the keeper gets hit, or takes the ball
// for a few overs. The scorer already had to be able to say so (a caught-behind
// asks who is keeping); this is where that answer is kept, so the scorecard's
// WK badge follows the game instead of naming whoever was marked at the toss
// for the rest of the day.
//
// One keeper per side at a time, so setting one clears the rest of that team.
// It does NOT rewrite history: a stumping or a catch already records the
// fielder by name on the ball, so an earlier dismissal keeps whoever actually
// did it.
const KeeperSchema = z.object({ teamId: z.string(), playerId: z.string() });

router.post('/:id/keeper', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { teamId, playerId } = KeeperSchema.parse(req.body);
    const matchId = req.params.id;

    const inSquad = await prisma.matchPlayer.findFirst({ where: { matchId, teamId, playerId } });
    if (!inSquad) return res.status(400).json({ error: 'That player is not in this match squad.' });

    await prisma.$transaction([
      prisma.matchPlayer.updateMany({ where: { matchId, teamId, NOT: { playerId } }, data: { isWk: false } }),
      prisma.matchPlayer.update({ where: { id: inSquad.id }, data: { isWk: true } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Discard a second innings that should never have started.
//
// Ending an innings is one tap behind a reason picker, and "Rain / abandoned"
// sits next to the reasons you actually mean — so it gets hit by accident. That
// used to be final: finishInnings creates the second Inning server-side and
// resets the scorer, with no way back to a first innings that wasn't finished.
//
// Only while the new innings is still empty. Once a ball has been bowled in it,
// undoing would delete real scoring, so this refuses and says so — at that point
// the way back is the ball-by-ball undo, one delivery at a time.
router.delete('/:id/innings/:inningId', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const inning = await prisma.inning.findUnique({
      where: { id: req.params.inningId },
      include: { oversData: { include: { balls: { take: 1 } } } },
    });
    if (!inning) return res.status(404).json({ error: 'Innings not found' });
    if (inning.matchId !== req.params.id) return res.status(400).json({ error: 'That innings belongs to another match' });
    if (inning.inningNumber === 1) {
      return res.status(400).json({ error: "The first innings can't be discarded" });
    }
    const balls = inning.oversData.reduce((n, o) => n + o.balls.length, 0);
    if (balls > 0) {
      return res.status(409).json({
        error: 'This innings already has deliveries in it. Undo them ball by ball first.',
        code: 'INNINGS_NOT_EMPTY',
      });
    }

    await prisma.$transaction([
      prisma.over.deleteMany({ where: { inningId: inning.id } }),
      prisma.inning.delete({ where: { id: inning.id } }),
      // Back to the first innings, still live.
      prisma.match.update({ where: { id: req.params.id }, data: { currentInnings: 1, status: 'live' } }),
    ]);
    res.json({ success: true, resumedInningNumber: 1 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/innings', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const { battingTeamId, bowlingTeamId, targetScore } = req.body;
    const inning = await prisma.inning.create({
      data: { matchId: req.params.id, inningNumber: 2, battingTeamId, bowlingTeamId, targetScore },
    });
    await prisma.match.update({
      where: { id: req.params.id },
      data: { currentInnings: 2, status: 'live' },
    });
    res.status(201).json({ inning });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/innings', async (req, res) => {
  try {
    const innings = await prisma.inning.findMany({
      where: { matchId: req.params.id },
      orderBy: { inningNumber: 'asc' },
    });
    res.json({ innings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: true,
        team2: true,
        squads: { include: { player: true } },
        innings: { orderBy: { inningNumber: 'asc' } },
      },
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /matches/:id/photos → photos captured for this match, newest first.
router.get('/:id/photos', async (req, res) => {
  try {
    const photos = await prisma.galleryPhoto.findMany({
      where: { matchId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    res.json({ photos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /matches/:id/photos  { url, caption? }
// Add a match photo. It's stored once per team that played, so it shows up in
// BOTH teams' galleries automatically. Open to anyone involved in the match —
// the scorer/creator, or a member of either side — since match photos are
// collaborative (this is intentionally NOT gated on team-admin like the team
// gallery is). Returns the created photo rows.
router.post('/:id/photos', authMiddleware, async (req, res) => {
  try {
    const { url, caption } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const uid = req.user.sub;
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const isParticipant =
      match.scorerId === uid ||
      match.createdBy === uid ||
      !!(await prisma.player.findFirst({
        where: { userId: uid, teamId: { in: [match.team1Id, match.team2Id] } },
        select: { id: true },
      }));
    if (!isParticipant) {
      return res.status(403).json({ error: 'Only people involved in the match can add photos' });
    }

    // One row per team so the photo lands in each team's gallery.
    const teamIds = [...new Set([match.team1Id, match.team2Id].filter(Boolean))];
    const photos = [];
    for (const teamId of teamIds) {
      photos.push(await prisma.galleryPhoto.create({
        data: { url, caption: caption || null, teamId, matchId: match.id, userId: null },
      }));
    }
    res.status(201).json({ photos });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/insights', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: {
            battingTeam: true,
            bowlingTeam: true,
            oversData: {
              include: {
                bowler: true,
                balls: { include: { batter: true, bowler: true }, orderBy: { ballNumber: 'asc' } },
              },
              orderBy: { overNumber: 'asc' },
            },
          },
          orderBy: { inningNumber: 'asc' },
        },
      },
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const inningsInsights = match.innings.map(inning => {
      const allBalls = inning.oversData.flatMap(o => o.balls);

      const batterMap = {};
      for (const ball of allBalls) {
        const id = ball.batterId;
        if (!batterMap[id]) batterMap[id] = { player: ball.batter, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
        if (!ball.extraType || ball.extraType === 'legBye' || ball.extraType === 'bye') batterMap[id].balls++;
        if (!ball.extraType || ['legBye', 'bye'].includes(ball.extraType)) {
          batterMap[id].runs += ball.runs;
          if (ball.runs === 4) batterMap[id].fours++;
          if (ball.runs === 6) batterMap[id].sixes++;
        }
        if (ball.isWicket && ball.dismissedPlayerId === id) batterMap[id].isOut = true;
      }
      const batting = Object.values(batterMap)
        .sort((a, b) => b.runs - a.runs)
        .map(b => ({ ...b, strikeRate: b.balls > 0 ? +((b.runs / b.balls) * 100).toFixed(2) : 0 }));

      // Per-DELIVERY bowler (shared overs split correctly), falling back to the
      // over's bowler for legacy balls with no bowlerId.
      const bowlerMap = {};
      for (const over of inning.oversData) {
        for (const ball of over.balls) {
          const id = ball.bowlerId || over.bowlerId;
          if (!id) continue;
          if (!bowlerMap[id]) bowlerMap[id] = { player: ball.bowler || over.bowler, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
          const et = ball.extraType;
          let charged = 0, legal = false;
          if (et === 'wide') { charged = ball.extras; bowlerMap[id].wides++; }
          else if (et === 'noBall') { charged = ball.runs + ball.extras; bowlerMap[id].noBalls++; }
          else if (et === 'bye' || et === 'legBye') legal = true;
          else if (et === 'penalty' || et === 'retired') charged = 0;
          else { charged = ball.runs; legal = true; }
          bowlerMap[id].runs += charged;
          if (legal) bowlerMap[id].balls++;
          if (ball.isWicket) {
            const wt = String(ball.wicketType || '').toLowerCase().replace(/\s/g, '');
            if (wt !== 'runout' && wt !== 'retired') bowlerMap[id].wickets++;
          }
        }
      }
      const bowling = Object.values(bowlerMap)
        .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
        .map(b => {
          const oversNum = b.balls / 6;
          return { ...b, overs: +oversNum.toFixed(1), oversStr: `${Math.floor(b.balls / 6)}.${b.balls % 6}`, economy: b.balls > 0 ? +(b.runs / oversNum).toFixed(2) : 0 };
        });

      const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
      for (const ball of allBalls) {
        // Runs-accurate extras: a wide/no-ball carries its ran runs too (wide+2 = 3
        // wide runs), so the breakdown sums to the innings' extras total instead of
        // just counting deliveries. No-ball extras = the 1-run penalty (runs off the
        // bat are the striker's, not extras).
        if (ball.extraType === 'wide')   extras.wides   += ball.extras;
        if (ball.extraType === 'noBall') extras.noBalls += ball.extras;
        if (ball.extraType === 'bye')    extras.byes    += ball.extras;
        if (ball.extraType === 'legBye') extras.legByes += ball.extras;
      }

      const runRate = inning.oversData.map(o => ({ over: o.overNumber, runs: o.runs + o.extras, wickets: o.wickets }));
      const fow = allBalls.filter(b => b.isWicket).map(b => ({ player: b.batter, runs: inning.totalRuns, over: null }));

      return {
        inningNumber: inning.inningNumber,
        battingTeam: inning.battingTeam,
        bowlingTeam: inning.bowlingTeam,
        totalRuns: inning.totalRuns,
        totalWickets: inning.totalWickets,
        batting,
        bowling,
        extras,
        runRate,
        fallOfWickets: fow,
      };
    });

    res.json({ matchId: match.id, team1: match.team1, team2: match.team2, innings: inningsInsights });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sport Events (multi-sport scoring) ──────────────────────

/*
  Metadata schemas per sport — validated server-side for data integrity.
  All fields are optional so clients can send partial metadata.
*/
const SportMetaSchemas = {
  football: z.object({
    bodyPart:        z.enum(['foot', 'head', 'other']).optional(),
    assistPlayerId:  z.string().optional(),
    isOwnGoal:       z.boolean().optional(),
    minute:          z.number().int().optional(),
    shotZone:        z.string().optional(),
  }),
  basketball: z.object({
    assistPlayerId:  z.string().optional(),
    shotZone:        z.enum(['paint', 'mid-range', 'three-point', 'free-throw']).optional(),
    quarter:         z.number().int().optional(),
  }),
  tennis: z.object({
    serveSide:       z.enum(['deuce', 'advantage']).optional(),
    shotType:        z.enum(['serve', 'forehand', 'backhand', 'volley', 'overhead']).optional(),
    courtZone:       z.string().optional(),
  }),
  volleyball: z.object({
    attackZone:      z.number().int().min(1).max(6).optional(),
    technique:       z.enum(['spike', 'tip', 'roll', 'block', 'serve']).optional(),
    rotation:        z.number().int().optional(),
  }),
  baseball: z.object({
    topBottom:       z.enum(['top', 'bottom']).optional(),
    battingOrder:    z.number().int().optional(),
    pitchType:       z.string().optional(),
    hitType:         z.enum(['single', 'double', 'triple', 'home-run', 'sacrifice']).optional(),
  }),
  badminton: z.object({
    shotType:        z.enum(['smash', 'drop', 'clear', 'drive', 'net', 'lob', 'lift']).optional(),
    rallyLength:     z.number().int().optional(),
    courtSide:       z.enum(['left', 'right', 'center']).optional(),
  }),
  tabletennis: z.object({
    serveType:       z.enum(['topspin', 'backspin', 'sidespin', 'flat']).optional(),
    shotType:        z.enum(['topspin', 'backspin', 'loop', 'smash', 'block', 'push', 'flick']).optional(),
    rallyLength:     z.number().int().optional(),
  }),
  hockey: z.object({
    shotType:        z.enum(['hit', 'drag-flick', 'push', 'deflection', 'penalty-stroke']).optional(),
    assistPlayerId:  z.string().optional(),
    quarter:         z.number().int().optional(),
    zone:            z.enum(['circle', 'midfield', 'defense']).optional(),
  }),
  kabaddi: z.object({
    raidNumber:      z.number().int().optional(),
    touchedPlayers:  z.array(z.string()).optional(),
    bonusPoint:      z.boolean().optional(),
    isAllOut:        z.boolean().optional(),
    halfNum:         z.number().int().optional(),
  }),
  khokho: z.object({
    direction:       z.enum(['clockwise', 'anticlockwise']).optional(),
    turnsTaken:      z.number().int().optional(),
    chaserPlayerId:  z.string().optional(),
  }),
  boxing: z.object({
    round:           z.number().int().optional(),
    punchType:       z.enum(['jab', 'cross', 'hook', 'uppercut', 'body-shot']).optional(),
    target:          z.enum(['head', 'body']).optional(),
    isClean:         z.boolean().optional(),
  }),
  karate: z.object({
    technique:       z.string().optional(),
    area:            z.enum(['head', 'body', 'leg']).optional(),
    distance:        z.enum(['close', 'mid', 'long']).optional(),
  }),
  judo: z.object({
    technique:       z.string().optional(),
    direction:       z.enum(['left', 'right']).optional(),
    holdDuration:    z.number().int().optional(),
  }),
  wrestling: z.object({
    move:            z.string().optional(),
    nearfallSeconds: z.number().int().optional(),
    period:          z.number().int().optional(),
  }),
  handball: z.object({
    shotType:        z.enum(['jump', 'standing', '7m', 'fast-break', 'wing', 'pivot']).optional(),
    assistPlayerId:  z.string().optional(),
    half:            z.number().int().optional(),
    goalZone:        z.string().optional(),
  }),
  golf: z.object({
    hole:            z.number().int().min(1).max(18).optional(),
    par:             z.number().int().optional(),
    strokeType:      z.enum(['drive', 'iron', 'chip', 'putt', 'wedge', 'sand']).optional(),
    isHoleInOne:     z.boolean().optional(),
  }),
  archery: z.object({
    end:             z.number().int().optional(),
    arrowNumber:     z.number().int().optional(),
    zone:            z.number().int().min(1).max(10).optional(),
    distanceM:       z.number().int().optional(),
  }),
  squash: z.object({
    rallyLength:     z.number().int().optional(),
    shotType:        z.enum(['drive', 'boast', 'drop', 'lob', 'cross-court', 'volley']).optional(),
    serverSide:      z.enum(['left', 'right']).optional(),
  }),
  pickleball: z.object({
    serveType:       z.enum(['drive', 'lob', 'drop']).optional(),
    isDink:          z.boolean().optional(),
    rallyLength:     z.number().int().optional(),
    kitchenViolation: z.boolean().optional(),
  }),
  billiards: z.object({
    frameNumber:     z.number().int().optional(),
    breakScore:      z.number().int().optional(),
    ballsPotted:     z.number().int().optional(),
    isMissed:        z.boolean().optional(),
  }),
  skateboard: z.object({
    runNumber:       z.number().int().optional(),
    tricks:          z.array(z.string()).optional(),
    airTime:         z.number().optional(),
    style:           z.enum(['halfpipe', 'slopestyle', 'big-air', 'cross', 'GS', 'SL']).optional(),
    landedClean:     z.boolean().optional(),
  }),
};

const SportEventSchema = z.object({
  sport:     z.string(),
  teamId:    z.string(),
  playerId:  z.string().optional(),
  eventType: z.string(),
  value:     z.number().int().default(1),
  period:    z.string().optional(),
  periodNum: z.number().int().optional(),
  metadata:  z.record(z.any()).optional(),
});

// POST /matches/:id/sport-events — record a scoring event
router.post('/:id/sport-events', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    const data = SportEventSchema.parse(req.body);

    // Validate sport-specific metadata if schema exists
    if (data.metadata && SportMetaSchemas[data.sport]) {
      try {
        SportMetaSchemas[data.sport].parse(data.metadata);
      } catch (metaErr) {
        return res.status(400).json({ error: `Invalid metadata for ${data.sport}: ${metaErr.message}` });
      }
    }

    const event = await prisma.sportEvent.create({
      data: { matchId: req.params.id, ...data },
    });

    // Recompute and persist match score
    const allEvents = await prisma.sportEvent.findMany({ where: { matchId: req.params.id } });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (match) {
      const score = computeSportScore(data.sport, allEvents, match.team1Id, match.team2Id);
      await prisma.match.update({
        where: { id: req.params.id },
        data: { score1: score.score1, score2: score.score2 },
      });
    }

    res.json({ success: true, data: event });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /matches/:id/sport-events/:eventId — undo last event
router.delete('/:id/sport-events/:eventId', authMiddleware, async (req, res) => {
  try {
    if (!(await assertScorer(req, res, req.params.id))) return;
    await prisma.sportEvent.delete({ where: { id: req.params.eventId } });

    // Recompute score after deletion
    const allEvents = await prisma.sportEvent.findMany({ where: { matchId: req.params.id } });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (match) {
      const score = computeSportScore(match.sport || 'football', allEvents, match.team1Id, match.team2Id);
      await prisma.match.update({
        where: { id: req.params.id },
        data: { score1: score.score1, score2: score.score2 },
      });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /matches/:id/sport-events — all events + computed score
router.get('/:id/sport-events', async (req, res) => {
  try {
    const match  = await prisma.match.findUnique({ where: { id: req.params.id } });
    const events = await prisma.sportEvent.findMany({
      where: { matchId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    const score = match ? computeSportScore(match.sport || 'football', events, match.team1Id, match.team2Id) : {};
    res.json({ success: true, data: { events, score } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /matches/:id/sport-stats — rich per-sport detailed stats
router.get('/:id/sport-stats', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { team1: true, team2: true },
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const events = await prisma.sportEvent.findMany({
      where: { matchId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    const score = computeSportScore(match.sport, events, match.team1Id, match.team2Id);
    const stats = computeDetailedStats(match.sport, events, match.team1Id, match.team2Id);

    // Enrich per-player stats with player names + which side they're on, so the
    // app can render a per-player scorecard grouped by team.
    if (stats.playerStats?.length) {
      const ids = [...new Set(stats.playerStats.map(p => p.playerId).filter(Boolean))];
      const players = ids.length
        ? await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      const nameById = Object.fromEntries(players.map(p => [p.id, p.name]));
      stats.playerStats = stats.playerStats.map(p => ({
        ...p,
        name: nameById[p.playerId] || 'Player',
        side: p.teamId === match.team1Id ? 'team1' : 'team2',
      }));
    }

    res.json({
      success: true,
      data: {
        matchId: match.id,
        sport: match.sport,
        status: match.status,   // lets the live-watch screen stop polling once done
        team1: match.team1,
        team2: match.team2,
        score,
        ...stats,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Score computation ────────────────────────────────────────

function sum(events, teamId, types) {
  return events
    .filter(e => e.teamId === teamId && types.includes(e.eventType))
    .reduce((acc, e) => acc + e.value, 0);
}

function countByTeam(events, teamId, type) {
  return events.filter(e => e.teamId === teamId && e.eventType === type).length;
}

function setWins(events, teamId) {
  return events.filter(e => e.teamId === teamId && e.eventType === 'set-win').length;
}

// ── Auto game/set engine (shared verbatim with frontend src/sports/scoring.js) ──
const RALLY_RULES = {
  volleyball:  { unitPts: 25, unitsToWin: 3, maxUnits: 5, finalUnitPts: 15 },
  badminton:   { unitPts: 21, unitsToWin: 2, maxUnits: 3, cap: 30 },
  tabletennis: { unitPts: 11, unitsToWin: 4, maxUnits: 7 },
  squash:      { unitPts: 11, unitsToWin: 3, maxUnits: 5 },
  pickleball:  { unitPts: 11, unitsToWin: 2, maxUnits: 3 },
};
const POINT_TYPES = new Set(['point', 'rally', 'ace', 'stroke', 'block']);
const isPoint = (e) => POINT_TYPES.has(e.eventType);

function deriveRally(events, t1, t2, rules) {
  const u = { [t1]: 0, [t2]: 0 }, p = { [t1]: 0, [t2]: 0 };
  for (const e of events) {
    if (!isPoint(e) || (e.teamId !== t1 && e.teamId !== t2)) continue;
    const tid = e.teamId, opp = tid === t1 ? t2 : t1;
    if (u[tid] >= rules.unitsToWin || u[opp] >= rules.unitsToWin) continue;
    p[tid] += 1;
    const played = u[t1] + u[t2];
    const target = (rules.finalUnitPts && played === rules.maxUnits - 1) ? rules.finalUnitPts : rules.unitPts;
    const win = (p[tid] >= target && p[tid] - p[opp] >= 2) || (rules.cap && p[tid] >= rules.cap);
    if (win) { u[tid] += 1; p[t1] = 0; p[t2] = 0; }
  }
  return { team1: { units: u[t1], points: p[t1] }, team2: { units: u[t2], points: p[t2] } };
}

function deriveTennis(events, t1, t2) {
  const setsToWin = 2;
  const sets = { [t1]: 0, [t2]: 0 }, games = { [t1]: 0, [t2]: 0 }, pts2 = { [t1]: 0, [t2]: 0 };
  for (const e of events) {
    if (!isPoint(e) || (e.teamId !== t1 && e.teamId !== t2)) continue;
    const tid = e.teamId, opp = tid === t1 ? t2 : t1;
    if (sets[tid] >= setsToWin || sets[opp] >= setsToWin) continue;
    const tiebreak = games[t1] === 6 && games[t2] === 6;
    pts2[tid] += 1;
    let gameWon = false;
    if (tiebreak) gameWon = pts2[tid] >= 7 && pts2[tid] - pts2[opp] >= 2;
    else if (pts2[tid] >= 4 && pts2[tid] - pts2[opp] >= 2) gameWon = true;
    if (gameWon) {
      games[tid] += 1; pts2[t1] = 0; pts2[t2] = 0;
      const setWon = (games[tid] >= 6 && games[tid] - games[opp] >= 2) || games[tid] === 7;
      if (setWon) { sets[tid] += 1; games[t1] = 0; games[t2] = 0; }
    }
  }
  return { team1: { sets: sets[t1], games: games[t1] }, team2: { sets: sets[t2], games: games[t2] } };
}

function computeSportScore(sport, events, team1Id, team2Id) {
  switch (sport) {

    case 'football': {
      const g1 = countByTeam(events, team1Id, 'goal');
      const g2 = countByTeam(events, team2Id, 'goal');
      return { score1: String(g1), score2: String(g2) };
    }

    case 'basketball': {
      const p1 = sum(events, team1Id, ['2pt', '3pt', 'freethrow']);
      const p2 = sum(events, team2Id, ['2pt', '3pt', 'freethrow']);
      return { score1: String(p1), score2: String(p2) };
    }

    case 'tennis': {
      const d = deriveTennis(events, team1Id, team2Id);
      return { score1: `${d.team1.sets} sets`, score2: `${d.team2.sets} sets` };
    }

    case 'volleyball': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.volleyball);
      return { score1: `${d.team1.units} sets`, score2: `${d.team2.units} sets` };
    }

    case 'badminton': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.badminton);
      return { score1: `${d.team1.units} games`, score2: `${d.team2.units} games` };
    }

    case 'tabletennis': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.tabletennis);
      return { score1: `${d.team1.units} games`, score2: `${d.team2.units} games` };
    }

    case 'hockey': {
      const g1 = countByTeam(events, team1Id, 'goal');
      const g2 = countByTeam(events, team2Id, 'goal');
      return { score1: String(g1), score2: String(g2) };
    }

    case 'kabaddi': {
      // touch-point + bonus-point + tackle-point; all-out = +2 bonus
      const tp1 = sum(events, team1Id, ['touch-point', 'bonus-point', 'tackle-point']);
      const ao1 = countByTeam(events, team1Id, 'all-out') * 2;
      const tp2 = sum(events, team2Id, ['touch-point', 'bonus-point', 'tackle-point']);
      const ao2 = countByTeam(events, team2Id, 'all-out') * 2;
      return { score1: String(tp1 + ao1), score2: String(tp2 + ao2) };
    }

    case 'khokho': {
      // out/pole-dive (1) + dream-run bonus (2) — matches scoring.js khokho.scoreLabel.
      const o1 = sum(events, team1Id, ['out', 'pole-dive', 'bonus']);
      const o2 = sum(events, team2Id, ['out', 'pole-dive', 'bonus']);
      return { score1: String(o1), score2: String(o2) };
    }

    case 'boxing': {
      // round-win events declare winner of each round
      const rw1 = countByTeam(events, team1Id, 'round-win');
      const rw2 = countByTeam(events, team2Id, 'round-win');
      const ko1 = countByTeam(events, team1Id, 'ko') + countByTeam(events, team1Id, 'tko');
      const ko2 = countByTeam(events, team2Id, 'ko') + countByTeam(events, team2Id, 'tko');
      if (ko1 > 0) return { score1: 'KO Win', score2: '-' };
      if (ko2 > 0) return { score1: '-', score2: 'KO Win' };
      return { score1: `${rw1} rds`, score2: `${rw2} rds` };
    }

    case 'karate': {
      // yuko=1, waza-ari=2, ippon=3 (ippon ends the match)
      const pts1 = sum(events, team1Id, ['yuko', 'waza-ari', 'ippon', 'nage-waza']);
      const pts2 = sum(events, team2Id, ['yuko', 'waza-ari', 'ippon', 'nage-waza']);
      return { score1: String(pts1), score2: String(pts2) };
    }

    case 'judo': {
      // Modern judo: waza-ari & ippon only; ippon (or 2 waza-ari) wins the bout.
      const wa = (tid) => countByTeam(events, tid, 'waza-ari') + countByTeam(events, tid, 'osaekomi');
      const win = (tid) => countByTeam(events, tid, 'ippon') > 0 || wa(tid) >= 2;
      if (win(team1Id)) return { score1: 'Ippon', score2: '-' };
      if (win(team2Id)) return { score1: '-', score2: 'Ippon' };
      return { score1: `${wa(team1Id)} wa`, score2: `${wa(team2Id)} wa` };
    }

    case 'wrestling': {
      // takedown=2, escape=1, reversal=2, nearfall=2-3 (use value field), pin ends match
      const p1 = sum(events, team1Id, ['takedown', 'suplex', 'escape', 'reversal', 'nearfall', 'penalty-pt']);
      const p2 = sum(events, team2Id, ['takedown', 'suplex', 'escape', 'reversal', 'nearfall', 'penalty-pt']);
      const pin1 = countByTeam(events, team1Id, 'pin');
      const pin2 = countByTeam(events, team2Id, 'pin');
      if (pin1 > 0) return { score1: 'Pin Win', score2: '-' };
      if (pin2 > 0) return { score1: '-', score2: 'Pin Win' };
      return { score1: String(p1), score2: String(p2) };
    }

    case 'handball': {
      // field goals + 7m-throw goals — matches the live scorer (scoring.js handball).
      const g1 = countByTeam(events, team1Id, 'goal') + countByTeam(events, team1Id, '7m-throw');
      const g2 = countByTeam(events, team2Id, 'goal') + countByTeam(events, team2Id, '7m-throw');
      return { score1: String(g1), score2: String(g2) };
    }

    case 'squash': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.squash);
      return { score1: `${d.team1.units} games`, score2: `${d.team2.units} games` };
    }

    case 'pickleball': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.pickleball);
      return { score1: `${d.team1.units} games`, score2: `${d.team2.units} games` };
    }

    case 'skateboard': {
      // Best run wins — highest value among run-score* events (scoring.js: run-score-90/80/70)
      const best = (tid) => {
        const runs = events.filter(e => e.teamId === tid && e.eventType.startsWith('run-score'));
        return runs.length ? Math.max(...runs.map(e => e.value)) : 0;
      };
      const best1 = best(team1Id), best2 = best(team2Id);
      return { score1: best1 > 0 ? `${best1} pts` : '–', score2: best2 > 0 ? `${best2} pts` : '–' };
    }

    default:
      return { score1: null, score2: null };
  }
}

// ── Detailed stats per sport ─────────────────────────────────

function computeDetailedStats(sport, events, team1Id, team2Id) {
  // Group events by period for all sports
  const maxPeriod = events.reduce((m, e) => Math.max(m, e.periodNum || 0), 0);
  const periodBreakdown = [];
  for (let p = 1; p <= maxPeriod; p++) {
    const pEvents = events.filter(e => e.periodNum === p);
    const score = computeSportScore(sport, pEvents, team1Id, team2Id);
    periodBreakdown.push({ period: p, score1: score.score1, score2: score.score2, eventCount: pEvents.length });
  }

  // Player contributions — aggregate value per player
  const playerMap = {};
  for (const e of events) {
    if (!e.playerId) continue;
    if (!playerMap[e.playerId]) playerMap[e.playerId] = { playerId: e.playerId, teamId: e.teamId, events: [] };
    playerMap[e.playerId].events.push(e);
  }

  const playerStats = Object.values(playerMap).map(p => {
    const base = { playerId: p.playerId, teamId: p.teamId, totalEvents: p.events.length };
    return { ...base, ...computePlayerStats(sport, p.events) };
  });

  // Sport-specific aggregate stats
  const sportAggregates = computeSportAggregates(sport, events, team1Id, team2Id);

  return { periodBreakdown, playerStats, ...sportAggregates };
}

function computePlayerStats(sport, events) {
  switch (sport) {
    case 'football':
      return {
        goals:       events.filter(e => e.eventType === 'goal').length,
        yellowCards: events.filter(e => e.eventType === 'yellow-card').length,
        redCards:    events.filter(e => e.eventType === 'red-card').length,
        assists:     events.filter(e => e.metadata?.assistPlayerId).length,
      };
    case 'basketball':
      return {
        points:      events.filter(e => ['2pt','3pt','freethrow'].includes(e.eventType)).reduce((s,e) => s + e.value, 0),
        twoPointers: events.filter(e => e.eventType === '2pt').length,
        threePointers: events.filter(e => e.eventType === '3pt').length,
        freeThrows:  events.filter(e => e.eventType === 'freethrow').length,
        fouls:       events.filter(e => e.eventType === 'foul').length,
      };
    case 'hockey':
      return {
        goals:        events.filter(e => e.eventType === 'goal').length,
        penaltyCorners: events.filter(e => e.eventType === 'penalty-corner').length,
        yellowCards:  events.filter(e => e.eventType === 'yellow-card').length,
        redCards:     events.filter(e => e.eventType === 'red-card').length,
      };
    case 'kabaddi':
      return {
        touchPoints:  events.filter(e => e.eventType === 'touch-point').reduce((s,e) => s + e.value, 0),
        tacklePoints: events.filter(e => e.eventType === 'tackle-point').reduce((s,e) => s + e.value, 0),
        bonusPoints:  events.filter(e => e.eventType === 'bonus-point').reduce((s,e) => s + e.value, 0),
        allOuts:      events.filter(e => e.eventType === 'all-out').length,
      };
    case 'boxing':
      return {
        punchesLanded: events.filter(e => ['jab','cross','hook','uppercut','body-shot'].includes(e.eventType)).length,
        knockdowns:    events.filter(e => e.eventType === 'knockdown').length,
        roundsWon:     events.filter(e => e.eventType === 'round-win').length,
      };
    case 'tennis':
      return {
        points:       events.filter(e => ['point','ace'].includes(e.eventType)).length,
        aces:         events.filter(e => e.eventType === 'ace').length,
        doubleFaults: events.filter(e => e.eventType === 'double-fault').length,
      };
    case 'volleyball':
      return {
        points: events.filter(e => ['point','rally','ace','block'].includes(e.eventType)).length,
        aces:   events.filter(e => e.eventType === 'ace').length,
        blocks: events.filter(e => e.eventType === 'block').length,
      };
    case 'badminton':
    case 'tabletennis':
    case 'pickleball':
      return {
        points: events.filter(e => ['point','ace'].includes(e.eventType)).length,
        aces:   events.filter(e => e.eventType === 'ace').length,
        faults: events.filter(e => e.eventType === 'fault').length,
      };
    case 'squash':
      return {
        points:  events.filter(e => ['point','stroke'].includes(e.eventType)).length,
        strokes: events.filter(e => e.eventType === 'stroke').length,
      };
    case 'handball':
      return {
        goals:       events.filter(e => e.eventType === 'goal').length,
        sevenMeters: events.filter(e => e.eventType === '7m-throw').length,
        yellowCards: events.filter(e => e.eventType === 'yellow-card').length,
        redCards:    events.filter(e => e.eventType === 'red-card').length,
      };
    case 'khokho':
      return {
        outs:        events.filter(e => ['out','pole-dive'].includes(e.eventType)).length,
        bonusPoints: events.filter(e => e.eventType === 'bonus').reduce((s,e) => s + e.value, 0),
      };
    case 'wrestling':
      return {
        points:    events.filter(e => ['takedown','escape','reversal','nearfall'].includes(e.eventType)).reduce((s,e) => s + e.value, 0),
        takedowns: events.filter(e => e.eventType === 'takedown').length,
        pins:      events.filter(e => e.eventType === 'pin').length,
      };
    case 'judo':
    case 'karate':
      return {
        points:    events.filter(e => ['yuko','waza-ari','ippon','nage-waza'].includes(e.eventType)).reduce((s,e) => s + e.value, 0),
        ippons:    events.filter(e => e.eventType === 'ippon').length,
        wazaAri:   events.filter(e => e.eventType === 'waza-ari').length,
        penalties: events.filter(e => e.eventType === 'penalty').length,
      };
    case 'skateboard':
      return {
        bestRun:    events.filter(e => e.eventType.startsWith('run-score')).reduce((m,e) => Math.max(m, e.value), 0),
        runsLanded: events.filter(e => e.eventType.startsWith('run-score')).length,
        crashes:    events.filter(e => e.eventType === 'crash').length,
      };
    default:
      return {
        totalPoints: events.reduce((s,e) => s + e.value, 0),
      };
  }
}

function computeSportAggregates(sport, events, team1Id, team2Id) {
  switch (sport) {
    case 'football': {
      const cards1 = { yellow: countByTeam(events, team1Id, 'yellow-card'), red: countByTeam(events, team1Id, 'red-card') };
      const cards2 = { yellow: countByTeam(events, team2Id, 'yellow-card'), red: countByTeam(events, team2Id, 'red-card') };
      const corners1 = countByTeam(events, team1Id, 'corner');
      const corners2 = countByTeam(events, team2Id, 'corner');
      return { cards: { team1: cards1, team2: cards2 }, corners: { team1: corners1, team2: corners2 } };
    }
    case 'basketball': {
      const fouls1 = countByTeam(events, team1Id, 'foul');
      const fouls2 = countByTeam(events, team2Id, 'foul');
      const timeouts1 = countByTeam(events, team1Id, 'timeout');
      const timeouts2 = countByTeam(events, team2Id, 'timeout');
      return { fouls: { team1: fouls1, team2: fouls2 }, timeouts: { team1: timeouts1, team2: timeouts2 } };
    }
    case 'tennis': {
      const aces1 = countByTeam(events, team1Id, 'ace');
      const aces2 = countByTeam(events, team2Id, 'ace');
      const df1   = countByTeam(events, team1Id, 'double-fault');
      const df2   = countByTeam(events, team2Id, 'double-fault');
      return { aces: { team1: aces1, team2: aces2 }, doubleFaults: { team1: df1, team2: df2 } };
    }
    case 'volleyball': {
      const aces1   = countByTeam(events, team1Id, 'ace');
      const aces2   = countByTeam(events, team2Id, 'ace');
      const blocks1 = countByTeam(events, team1Id, 'block');
      const blocks2 = countByTeam(events, team2Id, 'block');
      return { aces: { team1: aces1, team2: aces2 }, blocks: { team1: blocks1, team2: blocks2 } };
    }
    case 'kabaddi': {
      const tp = { team1: sum(events, team1Id, ['touch-point']),  team2: sum(events, team2Id, ['touch-point']) };
      const tk = { team1: sum(events, team1Id, ['tackle-point']), team2: sum(events, team2Id, ['tackle-point']) };
      const bn = { team1: sum(events, team1Id, ['bonus-point']),  team2: sum(events, team2Id, ['bonus-point']) };
      const ao = { team1: countByTeam(events, team1Id, 'all-out'), team2: countByTeam(events, team2Id, 'all-out') };
      return { touchPoints: tp, tacklePoints: tk, bonusPoints: bn, allOuts: ao };
    }
    case 'hockey': {
      const cards1 = { yellow: countByTeam(events, team1Id, 'yellow-card'), red: countByTeam(events, team1Id, 'red-card') };
      const cards2 = { yellow: countByTeam(events, team2Id, 'yellow-card'), red: countByTeam(events, team2Id, 'red-card') };
      const pc = { team1: countByTeam(events, team1Id, 'penalty-corner'), team2: countByTeam(events, team2Id, 'penalty-corner') };
      return { cards: { team1: cards1, team2: cards2 }, penaltyCorners: pc };
    }
    case 'handball': {
      const cards1 = { yellow: countByTeam(events, team1Id, 'yellow-card'), red: countByTeam(events, team1Id, 'red-card') };
      const cards2 = { yellow: countByTeam(events, team2Id, 'yellow-card'), red: countByTeam(events, team2Id, 'red-card') };
      const sevenMeters = { team1: countByTeam(events, team1Id, '7m-throw'), team2: countByTeam(events, team2Id, '7m-throw') };
      return { cards: { team1: cards1, team2: cards2 }, sevenMeters };
    }
    case 'khokho': {
      const outCount = (tid) => countByTeam(events, tid, 'out') + countByTeam(events, tid, 'pole-dive');
      const outs    = { team1: outCount(team1Id),                       team2: outCount(team2Id) };
      const bonuses = { team1: countByTeam(events, team1Id, 'bonus'),   team2: countByTeam(events, team2Id, 'bonus') };
      return { outs, bonuses };
    }
    case 'boxing': {
      const knockdowns = { team1: countByTeam(events, team1Id, 'knockdown'), team2: countByTeam(events, team2Id, 'knockdown') };
      const punchOf = (tid) => events.filter(e => e.teamId === tid && ['jab','cross','hook','uppercut','body-shot'].includes(e.eventType)).length;
      const punches    = { team1: punchOf(team1Id), team2: punchOf(team2Id) };
      const roundsWon  = { team1: countByTeam(events, team1Id, 'round-win'), team2: countByTeam(events, team2Id, 'round-win') };
      return { knockdowns, punches, roundsWon };
    }
    case 'wrestling': {
      const takedowns = { team1: countByTeam(events, team1Id, 'takedown'), team2: countByTeam(events, team2Id, 'takedown') };
      const pins      = { team1: countByTeam(events, team1Id, 'pin'), team2: countByTeam(events, team2Id, 'pin') };
      return { takedowns, pins };
    }
    case 'judo':
    case 'karate': {
      const ippons  = { team1: countByTeam(events, team1Id, 'ippon'), team2: countByTeam(events, team2Id, 'ippon') };
      const wazaAri = { team1: countByTeam(events, team1Id, 'waza-ari'), team2: countByTeam(events, team2Id, 'waza-ari') };
      return { ippons, wazaAri };
    }
    case 'skateboard': {
      const runsLanded = {
        team1: events.filter(e => e.teamId === team1Id && e.eventType.startsWith('run-score')).length,
        team2: events.filter(e => e.teamId === team2Id && e.eventType.startsWith('run-score')).length,
      };
      const crashes = { team1: countByTeam(events, team1Id, 'crash'), team2: countByTeam(events, team2Id, 'crash') };
      return { runsLanded, crashes };
    }
    case 'badminton':
    case 'pickleball':
    case 'tabletennis': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES[sport]);
      const games  = { team1: d.team1.units, team2: d.team2.units };
      const points = { team1: countByTeam(events, team1Id, 'point') + countByTeam(events, team1Id, 'ace'),
                       team2: countByTeam(events, team2Id, 'point') + countByTeam(events, team2Id, 'ace') };
      const aces   = { team1: countByTeam(events, team1Id, 'ace'), team2: countByTeam(events, team2Id, 'ace') };
      return { games, points, aces };
    }
    case 'squash': {
      const d = deriveRally(events, team1Id, team2Id, RALLY_RULES.squash);
      const games   = { team1: d.team1.units, team2: d.team2.units };
      const points  = { team1: countByTeam(events, team1Id, 'point') + countByTeam(events, team1Id, 'stroke'),
                        team2: countByTeam(events, team2Id, 'point') + countByTeam(events, team2Id, 'stroke') };
      const strokes = { team1: countByTeam(events, team1Id, 'stroke'), team2: countByTeam(events, team2Id, 'stroke') };
      return { games, points, strokes };
    }
    default:
      return {};
  }
}

export default router;
