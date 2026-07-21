import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { isTeamAdmin } from '../lib/teamAuth.js';

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
    // Scope every list to the active sport. Without this the Teams tab showed a
    // user's cricket teams while they were inside football — each sport is a
    // separate world in this app.
    const sport = req.query.sport ? String(req.query.sport) : null;
    const inSport = sport ? { sport } : {};

    const mine = await prisma.team.findMany({
      where: { ...inSport, OR: [{ ownerId: uid }, { players: { some: { userId: uid } } }] },
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
          where: { ...inSport, id: { in: [...oppIds] } }, include: { players: true }, orderBy: { name: 'asc' },
        });
      }
    }

    const follows = await prisma.teamFollow.findMany({
      where: { userId: uid, ...(sport ? { team: { sport } } : {}) },
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

const AwardSchema = z.object({
  title: z.string().min(1),
  year: z.union([z.string(), z.number()]).optional(),
  note: z.string().optional(),
});

const TeamSchema = z.object({
  name: z.string().min(1),
  sport: z.string().optional(),
  city: z.string().optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  homeGround: z.string().optional(),
  colors: z.string().optional(),
  bio: z.string().optional(),
  achievements: z.string().optional(),
  awards: z.array(AwardSchema).optional(),
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

// Leave a team — a member removes THEMSELVES (distinct from the admin removing
// someone). Detaches the caller's player row(s) for this team (teamId → null),
// preserving match history. The owner can't leave their own team; they'd hand it
// over or delete it instead.
router.post('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.sub;
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.ownerId === uid) {
      return res.status(400).json({ error: 'The team admin can’t leave their own team' });
    }
    const result = await prisma.player.updateMany({
      where: { teamId: req.params.id, userId: uid }, data: { teamId: null },
    });
    if (result.count === 0) return res.status(404).json({ error: 'You are not a member of this team' });
    res.json({ ok: true, left: result.count });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Request to join a team. Anyone signed in who isn't already the owner or a
// member can ask; re-requesting after a rejection resets it to pending.
router.post('/:id/join-requests', authMiddleware, async (req, res) => {
  try {
    const teamId = req.params.id;
    const uid = req.user.sub;
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.ownerId === uid) return res.status(400).json({ error: 'You already own this team' });
    const already = await prisma.player.findFirst({ where: { teamId, userId: uid }, select: { id: true } });
    if (already) return res.status(400).json({ error: 'You are already a member' });

    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : null;
    const request = await prisma.teamJoinRequest.upsert({
      where: { teamId_userId: { teamId, userId: uid } },
      create: { teamId, userId: uid, note, status: 'pending' },
      update: { note, status: 'pending' },
    });
    res.status(201).json({ request });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Approve a join request → adds the requester as a player on the team. Admin only.
router.post('/:id/join-requests/:userId/approve', authMiddleware, async (req, res) => {
  try {
    const { id: teamId, userId } = req.params;
    if (!(await isTeamAdmin(teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can approve requests' });
    }
    const reqRow = await prisma.teamJoinRequest.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { sport: true } });
    const existing = await prisma.player.findFirst({ where: { teamId, userId } });
    if (!existing) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Player';
      await prisma.player.create({ data: { name, role: 'Player', teamId, userId, sport: team?.sport || 'cricket' } });
    }
    await prisma.teamJoinRequest.update({ where: { teamId_userId: { teamId, userId } }, data: { status: 'approved' } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Reject a join request. Admin only.
router.post('/:id/join-requests/:userId/reject', authMiddleware, async (req, res) => {
  try {
    const { id: teamId, userId } = req.params;
    if (!(await isTeamAdmin(teamId, req.user.sub))) {
      return res.status(403).json({ error: 'Only a team admin can reject requests' });
    }
    await prisma.teamJoinRequest.updateMany({ where: { teamId, userId }, data: { status: 'rejected' } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Edit a team — any team admin (owner or a promoted member) may change its
// profile, logo, cover, achievements and awards. Legacy teams with no recorded
// owner stay editable by anyone signed in, and get claimed by the first editor.
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Team not found' });
    const uid = req.user.sub;
    if (!(await isTeamAdmin(req.params.id, uid))) {
      return res.status(403).json({ error: 'Only a team admin can edit this team' });
    }
    const data = TeamSchema.partial().parse(req.body);
    if (!existing.ownerId) data.ownerId = uid;   // claim an unowned legacy team
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Transfer ownership to another member. Only the current owner may do this; the
// new owner must be a member with a linked account. The old owner stays on as an
// admin so they don't lose access.
router.post('/:id/transfer-owner', authMiddleware, async (req, res) => {
  try {
    const teamId = req.params.id;
    const uid = req.user.sub;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.ownerId !== uid) return res.status(403).json({ error: 'Only the owner can transfer ownership' });
    if (userId === uid) return res.status(400).json({ error: 'You already own this team' });

    const target = await prisma.player.findFirst({ where: { teamId, userId } });
    if (!target) return res.status(400).json({ error: 'New owner must be a team member' });

    await prisma.team.update({ where: { id: teamId }, data: { ownerId: userId } });
    // New owner is implicitly admin; keep the outgoing owner as an admin too.
    await prisma.player.update({ where: { id: target.id }, data: { isAdmin: true } });
    await prisma.player.updateMany({ where: { teamId, userId: uid }, data: { isAdmin: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete a team. Only the owner may do this, and only if it has no match history
// (matches reference teams, and we won't rewrite scorecards). Dependent rows
// that are safe to remove — follows, gallery, join requests — are cleaned up, and
// remaining players are detached from the team.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const teamId = req.params.id;
    const uid = req.user.sub;
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.ownerId && team.ownerId !== uid) {
      return res.status(403).json({ error: 'Only the owner can delete this team' });
    }
    const matchCount = await prisma.match.count({ where: { OR: [{ team1Id: teamId }, { team2Id: teamId }] } });
    if (matchCount > 0) {
      return res.status(400).json({ error: 'This team has match history and can’t be deleted.' });
    }
    await prisma.$transaction([
      prisma.teamFollow.deleteMany({ where: { teamId } }),
      prisma.teamJoinRequest.deleteMany({ where: { teamId } }),
      prisma.galleryPhoto.deleteMany({ where: { teamId } }),
      prisma.player.updateMany({ where: { teamId }, data: { teamId: null, isAdmin: false } }),
      prisma.team.delete({ where: { id: teamId } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Open (or create) the team's group chat. Any current member — the owner, an
// admin, or a linked player (Player.userId = caller) — may open it. The room is
// created on first use, and its membership is synced to the team's CURRENT
// linked members every time it's opened: anyone added since last time is
// invited in, anyone no longer on the team (and not the owner) is removed, so
// access always matches the roster. Mirrors the join-request chat pattern.
router.post('/:id/chat', authMiddleware, async (req, res) => {
  try {
    const teamId = req.params.id;
    const uid = req.user.sub;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const linkedPlayers = await prisma.player.findMany({
      where: { teamId, userId: { not: null } }, select: { userId: true },
    });
    const memberIds = new Set(linkedPlayers.map((p) => p.userId));
    if (team.ownerId) memberIds.add(team.ownerId);
    if (!memberIds.has(uid)) {
      return res.status(403).json({ error: 'Only team members can open the team chat' });
    }

    let roomId = team.chatRoomId;
    if (roomId) {
      const existing = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!existing) roomId = null;   // was deleted out from under us — recreate below
    }

    if (!roomId) {
      const room = await prisma.chatRoom.create({
        data: {
          name: `${team.name} · Team Chat`,
          type: 'team',
          members: { create: [...memberIds].map((userId) => ({ userId })) },
        },
      });
      roomId = room.id;
      await prisma.team.update({ where: { id: teamId }, data: { chatRoomId: roomId } });
    } else {
      // Sync membership: add anyone new, drop anyone who's no longer on the team.
      const current = await prisma.chatMember.findMany({ where: { chatRoomId: roomId }, select: { userId: true } });
      const currentIds = new Set(current.map((m) => m.userId));
      const toAdd = [...memberIds].filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !memberIds.has(id));
      if (toAdd.length) {
        await prisma.chatMember.createMany({
          data: toAdd.map((userId) => ({ chatRoomId: roomId, userId })), skipDuplicates: true,
        });
      }
      if (toRemove.length) {
        await prisma.chatMember.deleteMany({ where: { chatRoomId: roomId, userId: { in: toRemove } } });
      }
    }

    res.json({ chatRoomId: roomId, name: `${team.name} · Team Chat` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Promote or demote a member as a team admin. Only an existing admin may do this.
// The owner is always an admin (their status can't be toggled here).
router.put('/:id/members/:playerId/admin', authMiddleware, async (req, res) => {
  try {
    const { id: teamId, playerId } = req.params;
    const uid = req.user.sub;
    if (!(await isTeamAdmin(teamId, uid))) {
      return res.status(403).json({ error: 'Only a team admin can change admins' });
    }
    const makeAdmin = req.body?.isAdmin !== false;   // default → promote
    const player = await prisma.player.findFirst({ where: { id: playerId, teamId } });
    if (!player) return res.status(404).json({ error: 'Member not found on this team' });
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } });
    if (team?.ownerId && player.userId && player.userId === team.ownerId) {
      return res.status(400).json({ error: 'The owner is always an admin' });
    }
    const updated = await prisma.player.update({ where: { id: playerId }, data: { isAdmin: makeAdmin } });
    res.json({ player: updated });
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
          if (!ball.extraType || ['legBye', 'bye'].includes(ball.extraType)) {
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

// Full team-profile payload for the Team Profile screen — one round-trip that
// bundles everything the screen shows: the team, its squad, recent matches, a
// win/loss record, a same-sport leaderboard (with this team's rank), the photo
// gallery, and the admin-entered achievements + awards.
router.get('/:id/profile', authMiddleware, async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { players: true },
    });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Who's an admin: the owner is always one; promoted members carry isAdmin.
    // Flag each member and tell the client whether the viewer can manage the team.
    const membersWithRole = team.players.map((p) => ({
      ...p,
      isAdmin: !!p.isAdmin || (!!team.ownerId && p.userId === team.ownerId),
      isOwner: !!team.ownerId && p.userId === team.ownerId,
    })).sort((a, b) => {
      // Captain first, then vice-captain, then by shirt number, then name.
      const rank = (m) => (m.isCaptain ? 0 : m.isViceCaptain ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const ja = a.jerseyNumber ?? 9999, jb = b.jerseyNumber ?? 9999;
      if (ja !== jb) return ja - jb;
      return (a.name || '').localeCompare(b.name || '');
    });
    const viewerId = req.user.sub;
    const viewerIsAdmin = await isTeamAdmin(teamId, viewerId);

    // Recent matches (any status), newest first.
    const recentMatches = await prisma.match.findMany({
      where: { OR: [{ team1Id: teamId }, { team2Id: teamId }] },
      include: { team1: true, team2: true },
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });

    // Same-sport teams → compute a leaderboard from completed matches (wins from
    // Match.result, which names the winning team). Mirrors the logic in GET /.
    const sportTeams = await prisma.team.findMany({
      where: { sport: team.sport }, select: { id: true, name: true, logoUrl: true },
    });
    const ids = sportTeams.map((t) => t.id);
    const [played, battedAgg, bowledAgg] = ids.length ? await Promise.all([
      prisma.match.findMany({
        where: { status: 'completed', OR: [{ team1Id: { in: ids } }, { team2Id: { in: ids } }] },
        select: { team1Id: true, team2Id: true, result: true },
      }),
      prisma.inning.groupBy({ by: ['battingTeamId'], _sum: { totalRuns: true }, where: { battingTeamId: { in: ids } } }),
      prisma.inning.groupBy({ by: ['bowlingTeamId'], _sum: { totalWickets: true }, where: { bowlingTeamId: { in: ids } } }),
    ]) : [[], [], []];

    const runsFor = Object.fromEntries(battedAgg.map((a) => [a.battingTeamId, a._sum.totalRuns || 0]));
    const wktsFor = Object.fromEntries(bowledAgg.map((a) => [a.bowlingTeamId, a._sum.totalWickets || 0]));
    const byName = Object.fromEntries(sportTeams.map((t) => [t.id, t.name]));
    const rec = {};
    for (const id of ids) rec[id] = { matches: 0, wins: 0, losses: 0 };
    for (const m of played) {
      for (const id of [m.team1Id, m.team2Id]) {
        if (!rec[id]) continue;
        rec[id].matches += 1;
        const res2 = m.result || '';
        const name = byName[id];
        if (!res2 || /tie/i.test(res2)) continue;
        if (name && res2.startsWith(name)) rec[id].wins += 1;
        else rec[id].losses += 1;
      }
    }

    const leaderboard = sportTeams
      .map((t) => {
        const r = rec[t.id];
        return {
          id: t.id, name: t.name, logoUrl: t.logoUrl,
          matches: r.matches, wins: r.wins, losses: r.losses,
          winRate: r.matches ? Math.round((r.wins / r.matches) * 100) : 0,
          isCurrent: t.id === teamId,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name))
      .map((row, i) => ({ ...row, rank: i + 1 }));

    // Generic "points scored" for non-cricket sports (goals/points/etc. score via
    // SportEvent, not innings), so the stat block isn't empty outside cricket.
    // Cricket keeps its runs/wickets, which come from the Inning aggregates above.
    const evAgg = await prisma.sportEvent.aggregate({ _sum: { value: true }, where: { teamId } });

    const mine = rec[teamId] || { matches: 0, wins: 0, losses: 0 };
    const stats = {
      matches: mine.matches, wins: mine.wins, losses: mine.losses,
      winRate: mine.matches ? Math.round((mine.wins / mine.matches) * 100) : 0,
      totalRuns: runsFor[teamId] || 0,
      totalWickets: wktsFor[teamId] || 0,
      pointsScored: evAgg._sum.value || 0,
      sport: team.sport,
      rank: (leaderboard.find((l) => l.isCurrent) || {}).rank || null,
      squadSize: team.players.length,
    };

    const gallery = await prisma.galleryPhoto.findMany({
      where: { teamId }, orderBy: { createdAt: 'desc' }, take: 60,
    });

    // Followers + the viewer's relationship to the team (member / owner / a
    // pending or rejected join request / none), so the UI can show the right CTA.
    const [followerCount, viewerFollow, viewerRequest] = await Promise.all([
      prisma.teamFollow.count({ where: { teamId } }),
      prisma.teamFollow.findUnique({ where: { userId_teamId: { userId: viewerId, teamId } } }).catch(() => null),
      prisma.teamJoinRequest.findUnique({ where: { teamId_userId: { teamId, userId: viewerId } } }).catch(() => null),
    ]);
    const isMember = membersWithRole.some((m) => m.userId === viewerId);
    const viewerJoinStatus = membersWithRole.find((m) => m.userId === viewerId)?.isOwner
      ? 'owner'
      : isMember ? 'member'
      : (viewerRequest?.status || 'none');   // pending | rejected | none

    // Pending join requests (admins only) — with requester name/avatar for the list.
    let joinRequests = [];
    if (viewerIsAdmin) {
      const pending = await prisma.teamJoinRequest.findMany({
        where: { teamId, status: 'pending' }, orderBy: { createdAt: 'asc' },
      });
      if (pending.length) {
        const users = await prisma.user.findMany({
          where: { id: { in: pending.map((p) => p.userId) } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true, city: true },
        });
        const byId = Object.fromEntries(users.map((u) => [u.id, u]));
        joinRequests = pending.map((p) => {
          const u = byId[p.userId] || {};
          return {
            userId: p.userId, note: p.note, createdAt: p.createdAt,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Player',
            avatarUrl: u.avatarUrl || null, city: u.city || null,
          };
        });
      }
    }

    res.json({
      team,
      members: membersWithRole,
      viewerIsAdmin,
      followerCount,
      viewerIsFollowing: !!viewerFollow,
      viewerJoinStatus,
      joinRequests,
      recentMatches,
      stats,
      leaderboard: leaderboard.slice(0, 10),
      gallery,
      achievements: team.achievements || '',
      awards: Array.isArray(team.awards) ? team.awards : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
