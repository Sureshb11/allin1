import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { validateSquad, applySubstitution } from '../lib/roster.js';
import { checkMatchMilestones } from '../lib/milestones.js';
import { pushMatchResultCard } from '../lib/feed.js';

const router = Router();

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

    if (!teamIds.length) return res.json({ matches: [] });

    const where = {
      OR: [{ team1Id: { in: teamIds } }, { team2Id: { in: teamIds } }],
    };
    if (sport) where.sport = String(sport);

    const matches = await prisma.match.findMany({
      where,
      include: { team1: true, team2: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ matches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const MatchSchema = z.object({
  team1Id: z.string(),
  team2Id: z.string(),
  status: z.string().default('scheduled'),
  venue: z.string().optional(),
  matchType: z.string().optional(),
  startTime: z.string().datetime().optional(),
  overs: z.number().int().optional(),
  ballType: z.string().optional(),
  sport: z.string().default('cricket'),
});

router.post('/', async (req, res) => {
  try {
    const data = MatchSchema.parse(req.body);

    // A match needs a squad: both teams must have at least one player.
    const [c1, c2] = await Promise.all([
      prisma.player.count({ where: { teamId: data.team1Id } }),
      prisma.player.count({ where: { teamId: data.team2Id } }),
    ]);
    if (c1 < 1 || c2 < 1) {
      return res.status(400).json({ error: 'Both teams need at least one player before a match can be created.' });
    }

    const match = await prisma.match.create({
      data: { ...data, currentInnings: 1 }
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
  clientEventId: z.string().optional().nullable(),   // offline idempotency key
});

router.put('/:id/score', async (req, res) => {
  try {
    const data = ScoreUpdateSchema.parse(req.body);

    // Idempotency: if this exact delivery was already recorded (e.g. a retry
    // after a flaky offline flush), return it without re-incrementing tallies.
    if (data.clientEventId) {
      const dupe = await prisma.ball.findUnique({ where: { clientEventId: data.clientEventId } });
      if (dupe) return res.json({ success: true, ball: dupe, idempotent: true });
    }

    let over = await prisma.over.findUnique({
      where: { inningId_overNumber: { inningId: data.inningId, overNumber: data.overNumber } }
    });

    if (!over) {
      over = await prisma.over.create({
        data: { inningId: data.inningId, overNumber: data.overNumber, bowlerId: data.bowlerId }
      });
    }

    const ball = await prisma.ball.create({
      data: {
        overId: over.id,
        clientEventId: data.clientEventId || undefined,
        ballNumber: data.ballNumber,
        batterId: data.batterId,
        nonStrikerId: data.nonStrikerId,
        runs: data.runs,
        extras: data.extras,
        extraType: data.extraType,
        isWicket: data.isWicket,
        wicketType: data.wicketType,
        dismissedPlayerId: data.dismissedPlayerId,
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

    res.json({ success: true, ball });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Undo the last delivery of an inning — deletes the most recent ball and
// reverses its over/inning tallies (dropping the over if it's now empty).
// Transactional so a mis-tapped ball can be cleanly taken back on the ground.
router.delete('/:id/score/last', async (req, res) => {
  try {
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
        },
      });
      // If that was the only ball in the over, remove the empty over too.
      const remaining = await tx.ball.count({ where: { overId: lastOver.id } });
      if (remaining === 0) await tx.over.delete({ where: { id: lastOver.id } });

      return { ball };
    });

    if (result.empty) return res.status(404).json({ error: 'No ball to undo' });
    res.json({ success: true, undone: result.ball });
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
          orderBy: { overNumber: 'desc' }, take: 1,
          include: { bowler: true, balls: { orderBy: { ballNumber: 'desc' }, include: { batter: true, nonStriker: true } } },
        },
      },
    });
    const inning = innings[innings.length - 1];
    if (!inning) return res.json({ sport: 'cricket', status: match.status, resumable: false });

    const curOver = inning.oversData[0];               // latest over of the current inning
    const lastBall = curOver?.balls[0];                // most recent delivery
    const legalThisOver = (curOver?.balls || []).filter((b) => !['wide', 'no-ball'].includes(b.extraType)).length;
    const overComplete = legalThisOver >= 6;
    const completedOvers = overComplete ? curOver.overNumber : (curOver ? curOver.overNumber - 1 : 0);
    const ballInOver = overComplete ? 0 : legalThisOver;

    // Squads (playing XIs) split by the current inning's batting/bowling team,
    // so the resumed scorer keeps the same player pickers.
    const squad = await prisma.matchPlayer.findMany({ where: { matchId: match.id }, include: { player: true } });
    const xiFor = (teamId) => squad.filter((s) => s.teamId === teamId).map((s) => ({ id: s.player.id, name: s.player.name }));

    // Notation for the balls already in the current over (to rebuild the log).
    const notate = (b) => b.extraType === 'wide' ? 'WD' : b.extraType === 'no-ball' ? 'NB'
      : b.extraType === 'bye' ? 'B' : b.extraType === 'legBye' ? 'LB' : b.extraType === 'penalty' ? 'P5'
      : b.isWicket ? 'W' : b.runs === 0 ? '·' : String(b.runs);
    const currentOverBalls = overComplete ? [] : [...(curOver?.balls || [])].reverse().map(notate);

    res.json({
      sport: 'cricket',
      status: match.status,
      resumable: true,
      matchId: match.id,
      team1: match.team1Id, team2: match.team2Id,
      totalOvers: match.overs || 20,
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
      // The pair at the crease + the bowler mid-over → rehydrate the UI exactly.
      // After a completed over the strike swaps and a new bowler is due.
      striker:    lastBall ? { id: lastBall.batter.id, name: lastBall.batter.name } : null,
      nonStriker: lastBall ? { id: lastBall.nonStriker.id, name: lastBall.nonStriker.name } : null,
      bowler:     overComplete ? null : (curOver?.bowler ? { id: curOver.bowler.id, name: curOver.bowler.name } : null),
      needsNewBatter: !!lastBall?.isWicket,
      needsNewBowler: overComplete,
      lastBall: lastBall ? { runs: lastBall.runs, extras: lastBall.extras, extraType: lastBall.extraType, isWicket: lastBall.isWicket } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/scorecard', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: true,
        team2: true,
        squads: { include: { player: true } },
        innings: {
          include: {
            battingTeam: true,
            bowlingTeam: true,
            oversData: {
              include: {
                bowler: true,
                balls: {
                  include: { batter: true, nonStriker: true },
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

router.put('/:id', async (req, res) => {
  try {
    const { status, score1, score2, result, currentInnings } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(score1 !== undefined && { score1 }),
        ...(score2 !== undefined && { score2 }),
        ...(result && { result }),
        ...(currentInnings && { currentInnings }),
      },
    });
    // On completion: post a match-result card + detect career milestones (which
    // also inject milestone cards). Inline because serverless suspends work
    // after the response; guarded so neither can fail the completion.
    if (status === 'completed') {
      await pushMatchResultCard(match).catch(() => {});
      await checkMatchMilestones(match.id);
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
const TossSchema = z.object({
  tossWinnerId:  z.string(),
  tossDecision:  z.enum(['bat', 'bowl']),
  battingTeamId: z.string(),
  bowlingTeamId: z.string(),
  squads: z.array(z.object({
    teamId:    z.string(),
    playerIds: z.array(z.string()).min(1),
  })).optional(),
});

router.post('/:id/toss', async (req, res) => {
  try {
    const data = TossSchema.parse(req.body);
    const matchId = req.params.id;

    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.match.update({
        where: { id: matchId },
        data: {
          tossWinnerId: data.tossWinnerId,
          tossDecision: data.tossDecision,
          status: 'live',
        },
      });
      await tx.inning.updateMany({
        where: { matchId, inningNumber: 1 },
        data: { battingTeamId: data.battingTeamId, bowlingTeamId: data.bowlingTeamId },
      });
      if (data.squads?.length) {
        await tx.matchPlayer.deleteMany({ where: { matchId } });
        await tx.matchPlayer.createMany({
          data: data.squads.flatMap((sq) =>
            sq.playerIds.map((playerId) => ({ matchId, teamId: sq.teamId, playerId }))
          ),
          skipDuplicates: true,
        });
      }
      return m;
    });

    res.json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/innings', async (req, res) => {
  try {
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
                balls: { include: { batter: true }, orderBy: { ballNumber: 'asc' } },
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
        if (!ball.extraType || ball.extraType === 'legbye' || ball.extraType === 'bye') batterMap[id].balls++;
        if (!ball.extraType || ['legbye', 'bye'].includes(ball.extraType)) {
          batterMap[id].runs += ball.runs;
          if (ball.runs === 4) batterMap[id].fours++;
          if (ball.runs === 6) batterMap[id].sixes++;
        }
        if (ball.isWicket && ball.dismissedPlayerId === id) batterMap[id].isOut = true;
      }
      const batting = Object.values(batterMap)
        .sort((a, b) => b.runs - a.runs)
        .map(b => ({ ...b, strikeRate: b.balls > 0 ? +((b.runs / b.balls) * 100).toFixed(2) : 0 }));

      const bowlerMap = {};
      for (const over of inning.oversData) {
        const id = over.bowlerId;
        if (!bowlerMap[id]) bowlerMap[id] = { player: over.bowler, overs: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
        bowlerMap[id].overs++;
        bowlerMap[id].runs += over.runs + over.extras;
        bowlerMap[id].wickets += over.wickets;
        for (const ball of over.balls) {
          if (ball.extraType === 'wide') bowlerMap[id].wides++;
          if (ball.extraType === 'no-ball') bowlerMap[id].noBalls++;
        }
      }
      const bowling = Object.values(bowlerMap)
        .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
        .map(b => ({ ...b, economy: b.overs > 0 ? +(b.runs / b.overs).toFixed(2) : 0 }));

      const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
      for (const ball of allBalls) {
        if (ball.extraType === 'wide')   extras.wides++;
        if (ball.extraType === 'no-ball') extras.noBalls++;
        if (ball.extraType === 'bye')    extras.byes += ball.extras;
        if (ball.extraType === 'legbye') extras.legByes += ball.extras;
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
router.post('/:id/sport-events', async (req, res) => {
  try {
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
router.delete('/:id/sport-events/:eventId', async (req, res) => {
  try {
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
      const ko1 = countByTeam(events, team1Id, 'ko');
      const ko2 = countByTeam(events, team2Id, 'ko');
      if (ko1 > 0) return { score1: 'KO Win', score2: '-' };
      if (ko2 > 0) return { score1: '-', score2: 'KO Win' };
      return { score1: `${rw1} rds`, score2: `${rw2} rds` };
    }

    case 'karate': {
      // yuko=1, waza-ari=2, ippon=3 (ippon ends the match)
      const pts1 = sum(events, team1Id, ['yuko', 'waza-ari', 'ippon']);
      const pts2 = sum(events, team2Id, ['yuko', 'waza-ari', 'ippon']);
      return { score1: String(pts1), score2: String(pts2) };
    }

    case 'judo': {
      // Modern judo: waza-ari & ippon only; ippon (or 2 waza-ari) wins the bout.
      const win = (tid) => countByTeam(events, tid, 'ippon') > 0 || countByTeam(events, tid, 'waza-ari') >= 2;
      if (win(team1Id)) return { score1: 'Ippon', score2: '-' };
      if (win(team2Id)) return { score1: '-', score2: 'Ippon' };
      const w1 = countByTeam(events, team1Id, 'waza-ari');
      const w2 = countByTeam(events, team2Id, 'waza-ari');
      return { score1: `${w1} wa`, score2: `${w2} wa` };
    }

    case 'wrestling': {
      // takedown=2, escape=1, reversal=2, nearfall=2-3 (use value field), pin ends match
      const p1 = sum(events, team1Id, ['takedown', 'escape', 'reversal', 'nearfall']);
      const p2 = sum(events, team2Id, ['takedown', 'escape', 'reversal', 'nearfall']);
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
        punchesLanded: events.filter(e => e.eventType === 'punch-landed').length,
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
        points:    events.filter(e => ['yuko','waza-ari','ippon'].includes(e.eventType)).reduce((s,e) => s + e.value, 0),
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
      const punches    = { team1: countByTeam(events, team1Id, 'punch-landed'), team2: countByTeam(events, team2Id, 'punch-landed') };
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
