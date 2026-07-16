import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  // Sport isolation: scope the team list to a sport when asked (the team pickers
  // pass the current sport so, e.g., a cricket tournament never sees football teams).
  const { sport } = req.query;
  const teams = await prisma.team.findMany({
    where: sport ? { sport: String(sport) } : {},
    include: { players: true },
  });

  // Attach REAL records computed from completed matches. Team.stats is a JSON
  // column that nothing ever writes, so it came back null and the Rankings
  // leaderboard rendered every team as 0 matches / 0 wins / 0% — the same
  // problem /players already solved for batting and bowling.
  //
  // Win/loss comes from Match.result, which is free text ("<Team> won by 42
  // runs"), so it's matched against the team's own name. Anything that doesn't
  // name a winner (a tie, or a completed match with no result string) counts as
  // played but neither won nor lost.
  const ids = teams.map((t) => t.id);
  const [played, battedAgg, bowledAgg] = ids.length ? await Promise.all([
    prisma.match.findMany({
      where: {
        status: 'completed',
        OR: [{ team1Id: { in: ids } }, { team2Id: { in: ids } }],
      },
      select: { team1Id: true, team2Id: true, result: true },
    }),
    // Runs scored = every innings this team batted. Wickets taken = the wickets
    // that fell in innings it bowled. The card has always had RUNS and WICKETS
    // columns; with stats null they rendered 0 for everyone.
    prisma.inning.groupBy({ by: ['battingTeamId'], _sum: { totalRuns: true }, where: { battingTeamId: { in: ids } } }),
    prisma.inning.groupBy({ by: ['bowlingTeamId'], _sum: { totalWickets: true }, where: { bowlingTeamId: { in: ids } } }),
  ]) : [[], [], []];

  const runsFor = Object.fromEntries(battedAgg.map((a) => [a.battingTeamId, a._sum.totalRuns || 0]));
  const wktsFor = Object.fromEntries(bowledAgg.map((a) => [a.bowlingTeamId, a._sum.totalWickets || 0]));

  const byName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const rec = {};
  for (const id of ids) rec[id] = { matches: 0, wins: 0, losses: 0 };
  for (const m of played) {
    const res = m.result || '';
    for (const id of [m.team1Id, m.team2Id]) {
      if (!rec[id]) continue;                       // opponent outside this sport scope
      rec[id].matches += 1;
      const name = byName[id];
      if (!res || /tie/i.test(res)) continue;       // played, but no winner
      if (name && res.startsWith(name)) rec[id].wins += 1;
      else rec[id].losses += 1;
    }
  }

  const enriched = teams.map((t) => {
    const r = rec[t.id];
    return { ...t, stats: {
      ...(t.stats || {}),
      matches: r.matches,
      wins: r.wins,
      losses: r.losses,
      winRate: r.matches ? Math.round((r.wins / r.matches) * 100) : 0,
      totalRuns: runsFor[t.id] || 0,
      totalWickets: wktsFor[t.id] || 0,
    } };
  });

  res.json({ teams: enriched });
});

// Teams grouped for the logged-in user: My Teams / Opponents / Followed.
//  - mine:      teams they created (ownerId) OR are a player in
//  - opponents: teams that have faced their teams in a match (the other side)
//  - followed:  teams they've explicitly followed (TeamFollow)
router.get('/categorized', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.sub;
    const mine = await prisma.team.findMany({
      where: { OR: [{ ownerId: uid }, { players: { some: { userId: uid } } }] },
      include: { players: true },
      orderBy: { name: 'asc' },
    });
    const mineIds = mine.map((t) => t.id);

    let opponents = [];
    if (mineIds.length) {
      const matches = await prisma.match.findMany({
        where: { OR: [{ team1Id: { in: mineIds } }, { team2Id: { in: mineIds } }] },
        select: { team1Id: true, team2Id: true },
      });
      const oppIds = new Set();
      const mineSet = new Set(mineIds);
      for (const m of matches) {
        if (mineSet.has(m.team1Id) && !mineSet.has(m.team2Id)) oppIds.add(m.team2Id);
        if (mineSet.has(m.team2Id) && !mineSet.has(m.team1Id)) oppIds.add(m.team1Id);
      }
      if (oppIds.size) {
        opponents = await prisma.team.findMany({
          where: { id: { in: [...oppIds] } }, include: { players: true }, orderBy: { name: 'asc' },
        });
      }
    }

    const follows = await prisma.teamFollow.findMany({
      where: { userId: uid },
      include: { team: { include: { players: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const followed = follows.map((f) => f.team);

    res.json({ mine, opponents, followed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: { players: true } });
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json({ team });
});

const TeamSchema = z.object({
  name: z.string().min(1),
  sport: z.string().optional(),
  city: z.string().optional(),
  logoUrl: z.string().url().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  homeGround: z.string().optional(),
  colors: z.string().optional(),
  bio: z.string().optional(),
  achievements: z.string().optional(),
  foundedYear: z.number().int().optional(),
});

// Creating a team makes it one of "my teams" — stamp the owner.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = TeamSchema.parse(req.body);
    const team = await prisma.team.create({ data: { ...data, ownerId: req.user.sub } });
    res.status(201).json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Follow / unfollow a team (the "Followed" category).
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const follow = await prisma.teamFollow.upsert({
      where: { userId_teamId: { userId: req.user.sub, teamId: req.params.id } },
      create: { userId: req.user.sub, teamId: req.params.id },
      update: {},
    });
    res.status(201).json({ follow });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id/follow', authMiddleware, async (req, res) => {
  try {
    await prisma.teamFollow.deleteMany({ where: { userId: req.user.sub, teamId: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = TeamSchema.partial().parse(req.body);
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Team insights — form, top performers
router.get('/:id/insights', async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Last 5 completed matches
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ team1Id: teamId }, { team2Id: teamId }],
        status: 'completed',
      },
      include: { team1: true, team2: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const form = recentMatches.map(m => {
      const won = m.result && m.result.toLowerCase().includes(team.name.toLowerCase());
      return { matchId: m.id, opponent: m.team1Id === teamId ? m.team2 : m.team1, result: won ? 'W' : 'L', score1: m.score1, score2: m.score2 };
    });

    // Top batters from innings where this team batted
    const battingInnings = await prisma.inning.findMany({
      where: { battingTeamId: teamId },
      include: {
        oversData: {
          include: { balls: { include: { batter: true } } },
        },
      },
    });

    const batterMap = {};
    for (const inning of battingInnings) {
      for (const over of inning.oversData) {
        for (const ball of over.balls) {
          const id = ball.batterId;
          if (!batterMap[id]) batterMap[id] = { player: ball.batter, runs: 0, balls: 0, innings: new Set() };
          batterMap[id].innings.add(inning.id);
          if (!ball.extraType || ['legbye', 'bye'].includes(ball.extraType)) {
            batterMap[id].runs += ball.runs;
            batterMap[id].balls++;
          }
        }
      }
    }
    const topBatters = Object.values(batterMap)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5)
      .map(b => ({ player: b.player, runs: b.runs, innings: b.innings.size, average: b.innings.size > 0 ? +(b.runs / b.innings.size).toFixed(2) : 0 }));

    // Top bowlers from innings where this team bowled
    const bowlingInnings = await prisma.inning.findMany({
      where: { bowlingTeamId: teamId },
      include: {
        oversData: { include: { bowler: true } },
      },
    });

    const bowlerMap = {};
    for (const inning of bowlingInnings) {
      for (const over of inning.oversData) {
        const id = over.bowlerId;
        if (!bowlerMap[id]) bowlerMap[id] = { player: over.bowler, overs: 0, runs: 0, wickets: 0 };
        bowlerMap[id].overs++;
        bowlerMap[id].runs += over.runs + over.extras;
        bowlerMap[id].wickets += over.wickets;
      }
    }
    const topBowlers = Object.values(bowlerMap)
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
      .slice(0, 5)
      .map(b => ({ ...b, economy: b.overs > 0 ? +(b.runs / b.overs).toFixed(2) : 0 }));

    // Win/loss record
    const allMatches = await prisma.match.findMany({
      where: { OR: [{ team1Id: teamId }, { team2Id: teamId }], status: 'completed' },
      select: { result: true },
    });
    const wins = allMatches.filter(m => m.result && m.result.toLowerCase().includes(team.name.toLowerCase())).length;

    res.json({
      team,
      stats: { played: allMatches.length, won: wins, lost: allMatches.length - wins, winRate: allMatches.length > 0 ? +((wins / allMatches.length) * 100).toFixed(1) : 0 },
      form,
      topBatters,
      topBowlers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
