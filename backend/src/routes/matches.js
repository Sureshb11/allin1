import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

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

const MatchSchema = z.object({
  team1Id: z.string(),
  team2Id: z.string(),
  status: z.string().default('scheduled'),
  venue: z.string().optional(),
  matchType: z.string().optional(),
  startTime: z.string().datetime().optional(),
  overs: z.number().int().optional(),
  sport: z.string().default('cricket'),
});

router.post('/', async (req, res) => {
  try {
    const data = MatchSchema.parse(req.body);
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
});

router.put('/:id/score', async (req, res) => {
  try {
    const data = ScoreUpdateSchema.parse(req.body);

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
  snowboarding: z.object({
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
      const s1 = setWins(events, team1Id);
      const s2 = setWins(events, team2Id);
      return { score1: `${s1} sets`, score2: `${s2} sets` };
    }

    case 'volleyball': {
      const s1 = setWins(events, team1Id);
      const s2 = setWins(events, team2Id);
      return { score1: `${s1} sets`, score2: `${s2} sets` };
    }

    case 'baseball': {
      const r1 = countByTeam(events, team1Id, 'run');
      const r2 = countByTeam(events, team2Id, 'run');
      return { score1: String(r1), score2: String(r2) };
    }

    case 'badminton': {
      const gw1 = countByTeam(events, team1Id, 'game-win');
      const gw2 = countByTeam(events, team2Id, 'game-win');
      return { score1: `${gw1} games`, score2: `${gw2} games` };
    }

    case 'tabletennis': {
      const gw1 = countByTeam(events, team1Id, 'game-win');
      const gw2 = countByTeam(events, team2Id, 'game-win');
      return { score1: `${gw1} games`, score2: `${gw2} games` };
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
      // out (1) + bonus (2) — matches the live scorer (scoring.js khokho.scoreLabel).
      const o1 = sum(events, team1Id, ['out', 'bonus']);
      const o2 = sum(events, team2Id, ['out', 'bonus']);
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
      // ippon=10, waza-ari=7, yuko=5
      const pts1 = sum(events, team1Id, ['ippon', 'waza-ari', 'yuko']);
      const pts2 = sum(events, team2Id, ['ippon', 'waza-ari', 'yuko']);
      return { score1: String(pts1), score2: String(pts2) };
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

    case 'golf': {
      // Individual strokes — lower is better; sum stroke events per team
      const s1 = sum(events, team1Id, ['stroke']);
      const s2 = sum(events, team2Id, ['stroke']);
      return { score1: `${s1} strokes`, score2: `${s2} strokes` };
    }

    case 'archery': {
      const arrowTypes = ['arrow-10', 'arrow-9', 'arrow-8', 'arrow-7', 'arrow-0'];
      const pts1 = sum(events, team1Id, arrowTypes);
      const pts2 = sum(events, team2Id, arrowTypes);
      return { score1: String(pts1), score2: String(pts2) };
    }

    case 'squash': {
      const gw1 = countByTeam(events, team1Id, 'game-win');
      const gw2 = countByTeam(events, team2Id, 'game-win');
      return { score1: `${gw1} games`, score2: `${gw2} games` };
    }

    case 'pickleball': {
      const gw1 = countByTeam(events, team1Id, 'game-win');
      const gw2 = countByTeam(events, team2Id, 'game-win');
      return { score1: `${gw1} games`, score2: `${gw2} games` };
    }

    case 'billiards': {
      const fw1 = countByTeam(events, team1Id, 'frame-won');
      const fw2 = countByTeam(events, team2Id, 'frame-won');
      return { score1: `${fw1} frames`, score2: `${fw2} frames` };
    }

    case 'snowboarding': {
      // Highest run-score event value wins
      const runs1 = events.filter(e => e.teamId === team1Id && e.eventType === 'run-score');
      const runs2 = events.filter(e => e.teamId === team2Id && e.eventType === 'run-score');
      const best1 = runs1.length ? Math.max(...runs1.map(e => e.value)) : 0;
      const best2 = runs2.length ? Math.max(...runs2.map(e => e.value)) : 0;
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
    case 'archery': {
      const arrowTypes = ['arrow-10','arrow-9','arrow-8','arrow-7','arrow-0'];
      return {
        arrowsFired: events.filter(e => arrowTypes.includes(e.eventType)).length,
        totalScore:  events.filter(e => arrowTypes.includes(e.eventType)).reduce((s,e) => s + e.value, 0),
        bullseyes:   events.filter(e => e.eventType === 'arrow-10').length,
      };
    }
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
      const allOuts1 = countByTeam(events, team1Id, 'all-out');
      const allOuts2 = countByTeam(events, team2Id, 'all-out');
      return { allOuts: { team1: allOuts1, team2: allOuts2 } };
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
      const bonuses = { team1: countByTeam(events, team1Id, 'bonus'), team2: countByTeam(events, team2Id, 'bonus') };
      return { bonuses };
    }
    case 'badminton':
    case 'pickleball':
    case 'tabletennis': {
      const games  = { team1: countByTeam(events, team1Id, 'game-win'), team2: countByTeam(events, team2Id, 'game-win') };
      const points = { team1: countByTeam(events, team1Id, 'point'),    team2: countByTeam(events, team2Id, 'point') };
      const aces   = { team1: countByTeam(events, team1Id, 'ace'),      team2: countByTeam(events, team2Id, 'ace') };
      return { games, points, aces };
    }
    case 'squash': {
      const games   = { team1: countByTeam(events, team1Id, 'game-win'), team2: countByTeam(events, team2Id, 'game-win') };
      const points  = { team1: countByTeam(events, team1Id, 'point'),    team2: countByTeam(events, team2Id, 'point') };
      const strokes = { team1: countByTeam(events, team1Id, 'stroke'),   team2: countByTeam(events, team2Id, 'stroke') };
      return { games, points, strokes };
    }
    default:
      return {};
  }
}

export default router;
