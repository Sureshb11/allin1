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
  // Scope to the requested sport. A user can hold a Player row per sport, and
  // findFirst() was returning whichever came first — so "My Stats" inside
  // football happily showed a cricket career (runs, wickets, centuries).
  const sport = req.query.sport ? String(req.query.sport) : null;
  const inSport = sport ? { sport } : {};

  let player = await prisma.player.findFirst({
    where: { ...inSport, userId: user.id }, include: { team: true },
  });
  if (!player && fullName) {
    player = await prisma.player.findFirst({
      where: { ...inSport, name: fullName }, include: { team: true },
    });
  }

  const base = { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 };
  // No player in THIS sport → zeros, not another sport's numbers.
  if (!player) return res.json({ stats: base, sport: sport || null, linked: false });

  const s = player.stats || {};
  // Real season match count = matches this player's team has played in their sport.
  const seasonMatches = player.teamId
    ? await prisma.match.count({ where: { sport: player.sport, OR: [{ team1Id: player.teamId }, { team2Id: player.teamId }] } })
    : 0;

  // ── Real cricket career numbers, computed from the ball-by-ball data ──────
  // Batting: every ball this player faced. Bowling: every ball in overs they
  // bowled. Overrides the static stats JSON whenever real deliveries exist.
  const [batBalls, dismissals, bowlBalls, xiMatches, momCount] = await Promise.all([
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
    // Career Player-of-the-Match count — the profile's star badge reads this.
    prisma.matchMVP.count({ where: { playerId: player.id } }),
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

  // ── Recent form: the player's last 5 completed matches ────────────────────
  // The profile has always had a RECENT FORM section, but nothing ever sent
  // this field, so it could never render. Win/loss comes from Match.result,
  // which is free text ("<Team> won by 42 runs") — so we match it against the
  // player's own team name rather than inventing a column. A tie (or an
  // unparseable result) yields result: null, which the client renders neutrally.
  const formRows = await prisma.matchPlayer.findMany({
    where: { playerId: player.id, match: { status: 'completed' } },
    orderBy: { match: { startTime: 'desc' } },
    take: 5,
    include: {
      team:  { select: { name: true } },
      match: { select: {
        id: true, result: true, startTime: true,
        team1: { select: { name: true } },
        team2: { select: { name: true } },
      } },
    },
  });

  let recentForm = [];
  if (formRows.length) {
    const formMatchIds = formRows.map((r) => r.matchId);
    const [fBat, fBowl, moms] = await Promise.all([
      prisma.ball.findMany({
        where: { batterId: player.id, over: { inning: { matchId: { in: formMatchIds } } } },
        select: { runs: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      prisma.ball.findMany({
        where: { over: { bowlerId: player.id, inning: { matchId: { in: formMatchIds } } } },
        select: { isWicket: true, wicketType: true, over: { select: { inning: { select: { matchId: true } } } } },
      }),
      // Player-of-the-match awards this player won in these matches.
      prisma.matchMVP.findMany({
        where: { playerId: player.id, matchId: { in: formMatchIds } },
        select: { matchId: true },
      }),
    ]);
    const momIds = new Set(moms.map((m) => m.matchId));
    const runsBy = {}, wktsBy = {};
    for (const b of fBat) {
      const id = b.over.inning.matchId;
      runsBy[id] = (runsBy[id] || 0) + b.runs;
    }
    for (const b of fBowl) {
      if (!b.isWicket || b.wicketType === 'runOut') continue;   // run-outs aren't the bowler's
      const id = b.over.inning.matchId;
      wktsBy[id] = (wktsBy[id] || 0) + 1;
    }
    recentForm = formRows.map((r) => {
      const m = r.match;
      const mine = r.team?.name || '';
      const opponent = m.team1?.name === mine ? m.team2?.name : m.team1?.name;
      const res = m.result || '';
      let result = null;
      if (mine && res.startsWith(mine)) result = 'W';
      else if (res && !/tie/i.test(res)) result = 'L';
      return {
        matchId: m.id,
        opponent: opponent || 'Unknown',
        result,
        runs: runsBy[m.id] ?? null,
        wickets: wktsBy[m.id] ?? null,
        isMOM: momIds.has(m.id),
      };
    });
  }

  // ── Non-cricket career stats ───────────────────────────────────────────────
  // Cricket's numbers come from the ball-by-ball tables above. Every other
  // sport records SportEvents instead, so a career line is just that player's
  // events tallied by type (goals, cards, …) across their matches. Returning
  // the raw tally keeps this generic — the app decides which types to show and
  // what to call them, so a new sport needs no change here.
  if (player.sport && player.sport !== 'cricket') {
    const evs = await prisma.sportEvent.findMany({
      where: { playerId: player.id },
      select: { matchId: true, eventType: true, value: true },
    });
    const byType = {};
    for (const e of evs) byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    const played = new Set(evs.map((e) => e.matchId)).size;

    return res.json({
      stats: {
        ...base,
        matches: played || seasonMatches,
        eventTotals: byType,               // { goal: 5, 'yellow-card': 2, … }
        seasonMatches,
        momCount,
        recentForm,
      },
      sport: player.sport,
      role: player.role,
      team: player.team?.name || null,
      linked: true,
    });
  }

  const stats = {
    ...base,
    ...s,                                   // pass through any sport-specific fields (goals, assists, …)
    matches: s.matches ?? seasonMatches,
    average: s.average ?? s.battingAverage ?? 0,
    ...computed,                            // real ball-derived numbers win
    seasonMatches,
    momCount,
    recentForm,
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
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),          // allow single-name users (e.g. "Sachin")
  avatarUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
});

// Partial update — only the fields actually sent are changed, so an avatar-only
// save (just { avatarUrl }) no longer 400s on a missing firstName.
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const data = ProfileSchema.parse(req.body);
    const update = {};
    for (const k of ['firstName', 'lastName', 'avatarUrl', 'coverUrl', 'bio', 'city', 'district', 'state', 'country', 'pincode']) {
      if (data[k] !== undefined) update[k] = data[k];
    }
    const user = await prisma.user.update({ where: { id: req.user.sub }, data: update });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Module 6: claim a guest player → merge its history into the user's ───────
// A scorer creates guest Player rows (userId = null). When the real person
// registers, this transactionally links or MERGES that guest into the user's
// canonical player for the sport, re-pointing every historical record (balls
// bowled/faced, dismissals, generic events, squad rows) so guest matches count
// toward their career. Idempotent + guarded (can't claim someone else's).
router.post('/me/claim-player', authMiddleware, async (req, res) => {
  try {
    const { guestPlayerId } = req.body;
    if (!guestPlayerId) return res.status(400).json({ error: 'guestPlayerId required' });
    const me = req.user.sub;

    const guest = await prisma.player.findUnique({ where: { id: guestPlayerId } });
    if (!guest) return res.status(404).json({ error: 'Player not found' });
    if (guest.userId === me) return res.json({ success: true, merged: false, playerId: guest.id }); // idempotent
    if (guest.userId) return res.status(409).json({ error: 'That player is already claimed.' });

    const canonical = await prisma.player.findFirst({ where: { userId: me, sport: guest.sport } });

    const result = await prisma.$transaction(async (tx) => {
      // No existing player for this user+sport → just link the guest row.
      if (!canonical || canonical.id === guest.id) {
        await tx.player.update({ where: { id: guest.id }, data: { userId: me } });
        return { merged: false, playerId: guest.id };
      }
      // Otherwise re-point ALL historical references guest → canonical, then drop guest.
      const to = canonical.id, from = guest.id;
      await tx.over.updateMany({ where: { bowlerId: from }, data: { bowlerId: to } });
      await tx.ball.updateMany({ where: { batterId: from }, data: { batterId: to } });
      await tx.ball.updateMany({ where: { nonStrikerId: from }, data: { nonStrikerId: to } });
      await tx.ball.updateMany({ where: { dismissedPlayerId: from }, data: { dismissedPlayerId: to } });
      await tx.sportEvent.updateMany({ where: { playerId: from }, data: { playerId: to } });
      // MatchPlayer has @@unique(matchId, playerId): skip matches where the
      // canonical player is already in the squad to avoid a collision.
      const dupes = await tx.matchPlayer.findMany({
        where: { playerId: to }, select: { matchId: true },
      });
      const dupeMatchIds = dupes.map((d) => d.matchId);
      await tx.matchPlayer.deleteMany({ where: { playerId: from, matchId: { in: dupeMatchIds } } });
      await tx.matchPlayer.updateMany({ where: { playerId: from }, data: { playerId: to } });
      await tx.player.delete({ where: { id: from } });
      return { merged: true, playerId: to };
    });

    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
