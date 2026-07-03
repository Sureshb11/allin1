import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { entitlementsFor } from '../lib/entitlements.js';

const router = Router();

// Find an existing Local Legends user by mobile number (for "Add player" to a team).
// Matches on the last 10 digits so it works regardless of country-code formatting.
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const digits = String(req.query.phone || '').replace(/\D/g, '');
    if (digits.length < 8) return res.status(400).json({ error: 'Enter a valid mobile number' });
    const last10 = digits.slice(-10);
    const user = await prisma.user.findFirst({
      where: { phone: { endsWith: last10 } },
      select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true },
    });
    if (!user) return res.status(404).json({ error: 'No Local Legends user with that number' });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { sports: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Prefer an explicitly-linked player; fall back to matching by name.
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  let player = await prisma.player.findFirst({ where: { userId: user.id }, include: { team: true } });
  if (!player && fullName) {
    player = await prisma.player.findFirst({ where: { name: fullName }, include: { team: true } });
  }
  const { sports, ...userBase } = user;
  res.json({ user: userBase, player, sports, entitlements: entitlementsFor(user) });
});

// Aggregate stats for the logged-in user, sourced from their linked Player's stored
// stats (mapped to the shape the Profile / My Performance screens expect) plus a real
// match count from the DB. Returns zeros if the user isn't linked to a player yet.
router.get('/me/stats', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  let player = await prisma.player.findFirst({ where: { userId: user.id }, include: { team: true } });
  if (!player && fullName) player = await prisma.player.findFirst({ where: { name: fullName }, include: { team: true } });

  const base = { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 };
  if (!player) return res.json({ stats: base, sport: null, linked: false });

  const s = player.stats || {};
  // Real season match count = matches this player's team has played in their sport.
  const seasonMatches = player.teamId
    ? await prisma.match.count({ where: { sport: player.sport, OR: [{ team1Id: player.teamId }, { team2Id: player.teamId }] } })
    : 0;

  // ── Real cricket career numbers, computed from the ball-by-ball data ──────
  // Batting: every ball this player faced. Bowling: every ball in overs they
  // bowled. Overrides the static stats JSON whenever real deliveries exist.
  const [batBalls, dismissals, bowlBalls, xiMatches] = await Promise.all([
    prisma.ball.findMany({
      where: { batterId: player.id },
      select: { runs: true, extraType: true, over: { select: { inningId: true } } },
    }),
    prisma.ball.count({ where: { dismissedPlayerId: player.id } }),
    prisma.ball.findMany({
      where: { over: { bowlerId: player.id } },
      select: { runs: true, extras: true, extraType: true, isWicket: true, wicketType: true, over: { select: { inningId: true } } },
    }),
    prisma.matchPlayer.count({ where: { playerId: player.id } }),
  ]);

  const computed = {};
  if (batBalls.length) {
    const runs = batBalls.reduce((t, b) => t + b.runs, 0);
    const faced = batBalls.filter((b) => b.extraType !== 'wide').length;
    // Per-innings totals → high score, 50s, 100s.
    const perInning = {};
    for (const b of batBalls) perInning[b.over.inningId] = (perInning[b.over.inningId] || 0) + b.runs;
    const innScores = Object.values(perInning);
    computed.runs          = runs;
    computed.ballsFaced    = faced;
    computed.strikeRate    = faced ? +(runs / faced * 100).toFixed(1) : 0;
    computed.average       = dismissals ? +(runs / dismissals).toFixed(1) : runs;
    computed.highestScore  = Math.max(0, ...innScores);
    computed.centuries     = innScores.filter((r) => r >= 100).length;
    computed.halfCenturies = innScores.filter((r) => r >= 50 && r < 100).length;
    computed.fours         = batBalls.filter((b) => b.runs === 4).length;
    computed.sixes         = batBalls.filter((b) => b.runs === 6).length;
    computed.notOuts       = Math.max(0, innScores.length - dismissals);
  }
  if (bowlBalls.length) {
    // Penalty runs are a team award, not the bowler's fault — exclude them from
    // legal-ball count and runs conceded.
    const bowled = bowlBalls.filter((b) => b.extraType !== 'penalty');
    const legal = bowled.filter((b) => b.extraType !== 'wide' && b.extraType !== 'noBall').length;
    const conceded = bowled.reduce((t, b) => t + b.runs + b.extras, 0);
    const wickets = bowled.filter((b) => b.isWicket && b.wicketType !== 'runOut').length;
    // Per-innings figures → best bowling ("3/12") + five-wicket hauls.
    const fig = {};
    for (const b of bowled) {
      const k = b.over.inningId;
      fig[k] = fig[k] || { w: 0, r: 0 };
      fig[k].r += b.runs + b.extras;
      if (b.isWicket && b.wicketType !== 'runOut') fig[k].w += 1;
    }
    const best = Object.values(fig).sort((a, b) => b.w - a.w || a.r - b.r)[0];
    computed.wickets        = wickets;
    computed.ballsBowled    = legal;
    computed.oversBowled    = `${Math.floor(legal / 6)}.${legal % 6}`;
    computed.runsConceded   = conceded;
    computed.economy        = legal ? +(conceded / (legal / 6)).toFixed(2) : 0;
    computed.bowlingAverage = wickets ? +(conceded / wickets).toFixed(1) : null;
    computed.bestBowling    = best ? `${best.w}/${best.r}` : null;
    computed.fiveWickets    = Object.values(fig).filter((f) => f.w >= 5).length;
  }
  if (xiMatches) computed.matches = xiMatches;

  const stats = {
    ...base,
    ...s,                                   // pass through any sport-specific fields (goals, assists, …)
    matches: s.matches ?? seasonMatches,
    average: s.average ?? s.battingAverage ?? 0,
    ...computed,                            // real ball-derived numbers win
    seasonMatches,
  };
  res.json({ stats, sport: player.sport, role: player.role, team: player.team?.name || null, linked: true });
});

// Set / update the sports a user is interested in (multi-sport profile).
const SportsSchema = z.object({
  sports: z.array(z.object({
    sport:     z.string().min(1),
    isPrimary: z.boolean().optional(),
    role:      z.string().optional().nullable(),
    skill:     z.string().optional().nullable(),
  })).min(1),
});

router.put('/me/sports', authMiddleware, async (req, res) => {
  try {
    const { sports } = SportsSchema.parse(req.body);
    const userId = req.user.sub;
    const hasPrimary = sports.some(s => s.isPrimary);
    await prisma.$transaction(sports.map((s, i) => {
      const isPrimary = s.isPrimary ?? (!hasPrimary && i === 0);
      return prisma.userSport.upsert({
        where:  { userId_sport: { userId, sport: s.sport } },
        update: { isPrimary, role: s.role ?? null, skill: s.skill ?? null },
        create: { userId, sport: s.sport, isPrimary, role: s.role ?? null, skill: s.skill ?? null },
      });
    }));
    const all = await prisma.userSport.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    res.json({ sports: all });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Choose the user's active/primary sport (e.g. from the Arena picker).
// Adds the sport if new, marks it primary, and unsets primary on the others.
const PrimarySportSchema = z.object({ sport: z.string().min(1) });

router.post('/me/primary-sport', authMiddleware, async (req, res) => {
  try {
    const { sport } = PrimarySportSchema.parse(req.body);
    const userId = req.user.sub;
    await prisma.$transaction([
      prisma.userSport.updateMany({ where: { userId }, data: { isPrimary: false } }),
      prisma.userSport.upsert({
        where:  { userId_sport: { userId, sport } },
        update: { isPrimary: true },
        create: { userId, sport, isPrimary: true },
      }),
    ]);
    const sports = await prisma.userSport.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    res.json({ sports });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const ProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().default(''), // allow single-name users (e.g. "Sachin")
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(500).optional().nullable()
});

router.put('/me', authMiddleware, async (req, res) => {
  try {
    const data = ProfileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user.sub }, data });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
