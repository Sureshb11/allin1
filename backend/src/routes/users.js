import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { FOLLOW_TYPE as PLAYER_FOLLOW_TYPE } from './players.js';
import { publicUser } from '../lib/publicUser.js';
import { authMiddleware } from '../lib/auth.js';
import { entitlementsFor } from '../lib/entitlements.js';
import { playerCareer, emptyCareer } from '../lib/playerCareer.js';
import { canonicalRole } from '../lib/squadOrder.js';
import { resyncShotZones } from '../lib/ballIntelligence.js';
import { playerShots } from '../lib/playerShots.js';

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
  //
  // Scoped to ?sport= when the caller names one — the same fix /me/stats
  // already carries. A user holds a player row per sport and findFirst returns
  // whichever comes first, so the profile screen could describe a footballer as
  // a right-arm quick. Unscoped without the param, so existing callers are
  // unaffected.
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const inSport = req.query.sport ? { sport: String(req.query.sport) } : {};

  // findMany, not findFirst, because a Player row IS a team membership — someone
  // in three clubs has three rows. The profile could only ever name one of them.
  // Same two-step as before (linked rows win; fall back to the name), so which
  // row answers as `player` is unchanged; it just also reports the rest.
  let rows = await prisma.player.findMany({
    where: { ...inSport, userId: user.id }, include: { team: true },
  });
  if (!rows.length && fullName) {
    rows = await prisma.player.findMany({
      where: { ...inSport, name: fullName }, include: { team: true },
    });
  }
  const player = rows[0] || null;
  // Distinct: two rows can point at one team across sports when unscoped.
  const teams = [...new Map(
    rows.map((r) => r.team).filter(Boolean).map((t) => [t.id, t]),
  ).values()];

  // Follower / following counts for the profile header. Computed here because
  // the profile already loads this route, and asking /players/:id/career for two
  // numbers would mean recomputing a whole career to draw them.
  //
  // Followers are counted across EVERY player row this account holds, deduped by
  // follower — a Player row is a team membership, so someone in three clubs has
  // three of them, and a follow lands on whichever one the follower tapped.
  // Following is a property of the account, so it is counted once.
  const selfIds = rows.map((r) => r.id);
  const [followerRows, followsPlayers, followsTeams, postCount] = await Promise.all([
    selfIds.length
      ? prisma.like.findMany({
          where: { targetType: PLAYER_FOLLOW_TYPE, targetId: { in: selfIds } },
          select: { userId: true },
          distinct: ['userId'],
        })
      : [],
    prisma.like.count({ where: { userId: user.id, targetType: PLAYER_FOLLOW_TYPE } }),
    prisma.teamFollow.count({ where: { userId: user.id } }),
    // Sport-scoped like the list it opens — and like `player` above, which this
    // same route already scopes with ?sport=. An unscoped count would name more
    // posts than the list can show.
    //
    // Attributed the way the feed does it: an explicit Post.playerId on any row
    // this account holds, or the account itself.
    prisma.post.count({
      where: {
        ...inSport,
        OR: [{ authorId: user.id }, ...(selfIds.length ? [{ playerId: { in: selfIds } }] : [])],
      },
    }),
  ]);

  const { sports, ...userBase } = user;
  res.json({
    user: publicUser(userBase),
    player,
    teams,
    sports,
    entitlements: entitlementsFor(user),
    followerCount: followerRows.length,
    followingCount: followsPlayers + followsTeams,
    postCount,
  });
});

// The logged-in user's career. This route is now just the lookup — which Player
// row is "me" — because GET /players/:id/career answers the same question about
// somebody else and the two must not disagree. Zeros if nothing is linked yet.
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

  // No player in THIS sport → zeros, not another sport's numbers.
  if (!player) return res.json(emptyCareer(sport));

  // MY stats is the career: every club this account plays for in this sport,
  // not whichever row findFirst happened to return. A team's own screens keep
  // passing one row, because "for this team" is what they are asking.
  const mine = await prisma.player.findMany({
    where: { ...inSport, userId: user.id }, select: { id: true, teamId: true },
  });
  player.teamIds = mine.map((p) => p.teamId).filter(Boolean);

  // The computation lives in lib/playerCareer.js so that tapping a player in
  // Rankings shows the same board of numbers, worked out the same way.
  res.json(await playerCareer(player, mine.map((p) => p.id)));
});

// ── My shots ─────────────────────────────────────────────────────────────────
// The logged-in user's own wagon wheel and shot profile, for "My Stats".
//
// Its own route rather than the client looking up its player id and calling
// /players/:id/shots, because those are not the same question. A user holds a
// Player row PER TEAM, and My Stats is the career across all of them — asking
// by a single id would quietly show one club's shots and call it your profile.
// This resolves the same set of rows /users/me/stats does, so the two halves of
// that screen describe the same player.
router.get('/me/shots', authMiddleware, async (req, res) => {
  try {
    const sport = req.query.sport || 'cricket';
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const mine = await prisma.player.findMany({
      where: { sport, userId: user.id },
      select: { id: true, battingStyle: true },
    });
    // No player in this sport yet is not an error — it is a new account, and the
    // screen renders its empty state from this.
    if (!mine.length) return res.json({ shots: [], analytics: null, insights: null, dna: null });

    // Any row will do for the hand: they are the same human.
    const data = await playerShots(prisma, mine.map((p) => p.id), mine[0]);
    res.json({ ...data, benchmark: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── How I play ───────────────────────────────────────────────────────────────
// The logged-in user describing THEMSELVES: primary role, batting hand, bowling
// style. Its own route because none of the existing ones can do this job:
//
//   · PUT /players/:id needs an id, and someone who has only ever watched has
//     no Player row at all — the onboarding step has nothing to send.
//   · It is also team-admin gated, which is right for editing somebody else's
//     shirt number and wrong for saying which hand you bat with.
//
// So this finds-or-creates the caller's own player for the sport, and writes
// only the three fields that describe a person rather than a squad. Captaincy,
// shirt number and team membership are decisions a team makes and stay on
// PUT /players/:id.
const MyPlayerSchema = z.object({
  sport:        z.string().min(1).optional(),
  role:         z.string().min(1),
  battingStyle: z.string().max(40).optional().nullable(),
  bowlingStyle: z.string().max(40).optional().nullable(),
});

router.put('/me/player', authMiddleware, async (req, res) => {
  try {
    const { sport = 'cricket', ...data } = MyPlayerSchema.parse(req.body);
    // Same folding as POST/PUT /players — one vocabulary, whichever door a role
    // comes through.
    data.role = canonicalRole(data.role, sport) || data.role;
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let player = await prisma.player.findFirst({ where: { sport, userId: user.id } });

    // Not linked yet, but GET /me and /me/stats have both been calling a
    // same-named unclaimed row "you" all along — so claim that one rather than
    // creating a second, which would leave those two routes reporting an empty
    // career next to a full one. Only when the name picks out exactly one
    // player: two people called Suresh must not be merged by a save button.
    if (!player) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      if (fullName) {
        const sameName = await prisma.player.findMany({
          where: { sport, name: fullName, userId: null }, select: { id: true }, take: 2,
        });
        if (sameName.length === 1) {
          player = await prisma.player.update({
            where: { id: sameName[0].id }, data: { userId: user.id },
          });
        }
      }
    }

    // Still nothing: a spectator who has decided they play. teamId stays null —
    // this says how they play, not who they play for.
    if (!player) {
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Player';
      player = await prisma.player.create({ data: { name, sport, userId: user.id, ...data } });
      return res.status(201).json({ player });
    }

    const updated = await prisma.player.update({ where: { id: player.id }, data });
    // Saying "actually I bat left-handed" renames every shot this player has
    // already played — a zone is a function of the angle AND the hand, and until
    // now they were being treated as a right-hander. Guarded so a profile edit
    // can never fail because of the analytics table, and only run when the hand
    // actually changed.
    if (data.battingStyle !== undefined && data.battingStyle !== player.battingStyle) {
      await resyncShotZones(prisma, player.id).catch((e) => console.error('[resyncShotZones]', e.message));
    }
    res.json({ player: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
  dateOfBirth: z.string().optional().nullable(),
  height: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
});

// Partial update — only the fields actually sent are changed, so an avatar-only
// save (just { avatarUrl }) no longer 400s on a missing firstName.
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const data = ProfileSchema.parse(req.body);
    const update = {};
    for (const k of ['firstName', 'lastName', 'avatarUrl', 'coverUrl', 'bio', 'city', 'district', 'state', 'country', 'pincode', 'dateOfBirth', 'height', 'weight', 'phone', 'email']) {
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
