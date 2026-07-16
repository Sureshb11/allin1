import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { computeStandings } from '../lib/standings.js';
import { applyTournamentResult } from '../lib/tournamentResult.js';
import { notifyTeams, notifyUsers, notifyAllParticipants, safeNotify } from '../lib/notify.js';
import { tournamentLeaderboard } from '../lib/leaderboard.js';

const router = Router();

// Gate for organiser-only actions. Runs AFTER authMiddleware (needs req.user).
// Legacy tournaments created before ownership tracking have no organizerId — those
// stay open so existing data isn't bricked; everything created now is locked down.
async function requireOrganizer(req, res, next) {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id }, select: { organizerId: true },
    });
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (t.organizerId && t.organizerId !== req.user.sub) {
      return res.status(403).json({ error: 'Only the organiser can do this' });
    }
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// ── Module 2: computed standings (points engine + per-sport tiebreakers) ─────
// Replaces the client-computed points table: this derives points + NRR/GD from
// recorded match results using the sport's SportConfiguration.standings rules.
router.get('/:id/standings', async (req, res) => {
  try {
    res.json({ standings: await computeStandings(req.params.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Tournament leaderboard: Orange Cap (runs), Purple Cap (wickets), MVP — from
// the ball-by-ball data of every fixture played through a real match.
router.get('/:id/leaderboard', async (req, res) => {
  try {
    res.json(await tournamentLeaderboard(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Report a tournament match result → records it, then recomputes the table.
// body: { tmId, winnerTeamId?|resultKind, stats: { [teamId]: {scored, conceded, oversFaced?, oversBowled?} } }
const ResultSchema = z.object({
  tmId:         z.string(),
  winnerTeamId: z.string().optional().nullable(),
  resultKind:   z.enum(['win', 'draw', 'tie', 'noResult']).default('win'),
  stats:        z.record(z.any()).optional(),
});
router.post('/:id/result', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const d = ResultSchema.parse(req.body);
    const { standings, resolved } = await applyTournamentResult(req.params.id, d);
    res.json({ success: true, standings, resolved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Link a real (ball-by-ball) Match to a fixture when scoring starts. The fixture
// goes 'live'; its result auto-populates when that match completes (see the
// match-completion hook in routes/matches.js). Sport-safe: the Match was created
// with the tournament's sport + same-sport teams, so the link can't cross sports.
router.put('/:id/fixtures/:tmId/match', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ error: 'matchId required' });
    const fixture = await prisma.tournamentMatch.update({
      where: { id: req.params.tmId },
      data: { matchId, status: 'live' },
    });
    res.json({ success: true, fixture });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Phases (League / Knockout / Series) ──────────────────────────────────────
router.get('/:id/phases', async (req, res) => {
  try {
    const phases = await prisma.tournamentPhase.findMany({
      where: { tournamentId: req.params.id }, orderBy: { order: 'asc' },
    });
    res.json({ phases });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PhaseSchema = z.object({
  type: z.enum(['league', 'knockout', 'series']),
  name: z.string().min(1),
  order: z.number().int().default(0),
  config: z.any().optional(),
});
router.post('/:id/phases', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const d = PhaseSchema.parse(req.body);
    const phase = await prisma.tournamentPhase.create({
      data: { tournamentId: req.params.id, ...d },
    });
    res.status(201).json({ phase });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Resolve a best-of-N series: winner = first to ceil(bestOf/2) leg wins.
router.get('/:id/series/:seriesId', async (req, res) => {
  try {
    const legs = await prisma.tournamentMatch.findMany({
      where: { tournamentId: req.params.id, seriesId: req.params.seriesId },
      orderBy: { leg: 'asc' },
      include: { phase: true },
    });
    const bestOf = legs[0]?.phase?.config?.bestOf || legs.length || 3;
    const need = Math.ceil(bestOf / 2);
    const wins = {};
    for (const l of legs) if (l.winnerTeamId) wins[l.winnerTeamId] = (wins[l.winnerTeamId] || 0) + 1;
    const decided = Object.entries(wins).find(([, w]) => w >= need);
    res.json({
      seriesId: req.params.seriesId, bestOf, need, wins,
      winnerTeamId: decided ? decided[0] : null,
      complete: !!decided,
      legs,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  const { sport, status } = req.query;
  const where = {};
  if (sport) where.sport = String(sport);
  if (status) where.status = String(status);
  const tournaments = await prisma.tournament.findMany({
    where,
    // Only approved teams count in the list view (pending join requests are hidden).
    include: { teams: { where: { status: 'approved' }, include: { team: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ tournaments });
});

router.get('/:id', async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      // Registered teams = approved only; pending join requests load via
      // GET /:id/join-requests (organiser-gated).
      teams:   { where: { status: 'approved' }, include: { team: true }, orderBy: { points: 'desc' } },
      matches: { orderBy: { scheduledAt: 'asc' } },
    },
  });
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  res.json({ tournament });
});

// Points table
router.get('/:id/points-table', async (req, res) => {
  try {
    const rows = await prisma.tournamentTeam.findMany({
      where: { tournamentId: req.params.id, status: 'approved' },
      include: { team: true },
      orderBy: [{ points: 'desc' }, { nrr: 'desc' }],
    });
    res.json({ pointsTable: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Schedule / Fixtures
router.get('/:id/schedule', async (req, res) => {
  try {
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: req.params.id },
      orderBy: { scheduledAt: 'asc' },
    });
    const enriched = await Promise.all(
      matches.map(async m => {
        const [team1, team2] = await Promise.all([
          m.team1Id ? prisma.team.findUnique({ where: { id: m.team1Id } }) : Promise.resolve(null),
          m.team2Id ? prisma.team.findUnique({ where: { id: m.team2Id } }) : Promise.resolve(null),
        ]);
        return { ...m, team1, team2 };
      })
    );
    res.json({ schedule: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Register a team in the tournament
router.post('/:id/teams', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { teamId, group = 'A' } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    // Sport isolation: a team can only enter a tournament of its own sport.
    const [tournament, team] = await Promise.all([
      prisma.tournament.findUnique({ where: { id: req.params.id }, select: { sport: true, name: true } }),
      prisma.team.findUnique({ where: { id: teamId }, select: { sport: true, name: true } }),
    ]);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.sport !== tournament.sport) {
      return res.status(400).json({ error: `Sport mismatch: ${team.name} is a ${team.sport} team but ${tournament.name} is a ${tournament.sport} tournament.` });
    }
    // Organiser adds a team directly → it's in (approved). If a join request for
    // this team is already pending, approve it rather than colliding on the unique.
    const entry = await prisma.tournamentTeam.upsert({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId } },
      update: { status: 'approved' },
      create: { tournamentId: req.params.id, teamId, group, status: 'approved' },
      include: { team: true },
    });

    // Notify the added team's members that they're in. Awaited before responding
    // because serverless suspends work after the response is sent.
    await safeNotify(() => notifyTeams([teamId], {
      title: 'Added to a tournament',
      message: `${entry.team?.name || 'Your team'} has been entered into ${tournament?.name || 'a tournament'}.`,
      data: { tournamentId: req.params.id },
    }));
    res.status(201).json({ entry });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Join requests ────────────────────────────────────────────────────────────
// A team OWNER asks to enter their team → creates a PENDING entry the organiser
// must approve. Any logged-in user may request, but only with a team they own.
router.post('/:id/join-requests', authMiddleware, async (req, res) => {
  try {
    const { teamId, group = 'A' } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    const [tournament, team] = await Promise.all([
      prisma.tournament.findUnique({ where: { id: req.params.id }, select: { sport: true, name: true, organizerId: true } }),
      prisma.team.findUnique({
        where: { id: teamId },
        select: { sport: true, name: true, ownerId: true, players: { select: { userId: true } } },
      }),
    ]);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    // Anyone in the team may ask — owner or player. This used to be owner-only,
    // which contradicted the app's own definition of "my teams" (/categorized =
    // owned OR played for): a player saw their team listed as theirs and was
    // then told they owned none. The organiser approves either way, so a request
    // commits nobody. The owner is notified below when it wasn't them.
    const isOwner  = team.ownerId === req.user.sub;
    const isMember = team.players.some((p) => p.userId === req.user.sub);
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'You can only request with a team you play for' });
    }
    if (team.sport !== tournament.sport) {
      return res.status(400).json({ error: `Sport mismatch: ${team.name} is a ${team.sport} team but ${tournament.name} is a ${tournament.sport} tournament.` });
    }
    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: req.params.id, teamId, group, status: 'pending', requestedById: req.user.sub },
      include: { team: true },
    });
    // Ping the organiser that a team wants in.
    if (tournament.organizerId) {
      await safeNotify(() => notifyUsers([tournament.organizerId], {
        title: 'New join request',
        message: `${team.name} has requested to join ${tournament.name}.`,
        data: { tournamentId: req.params.id },
      }));
    }
    // A player entered the owner's team — tell the owner, so entries can't
    // happen in their name without their knowledge. Skipped when the owner is
    // the requester, or is the organiser (they were just notified above).
    if (team.ownerId && !isOwner && team.ownerId !== tournament.organizerId) {
      await safeNotify(() => notifyUsers([team.ownerId], {
        title: 'Your team requested to join',
        message: `${team.name} has been entered into ${tournament.name} by a team member. The organiser will approve it.`,
        data: { tournamentId: req.params.id },
      }));
    }
    res.status(201).json({ entry });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'This team already requested or is registered' });
    res.status(400).json({ error: e.message });
  }
});

// List pending join requests (organiser only).
router.get('/:id/join-requests', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const requests = await prisma.tournamentTeam.findMany({
      where: { tournamentId: req.params.id, status: 'pending' },
      include: { team: { include: { players: { select: { id: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    // Resolve the requester to a name the organiser can actually recognise —
    // an id tells them nothing about who they're approving or replying to.
    // Rows created before requestedById existed (and organiser-added teams)
    // have none, so the client must tolerate a null requester.
    const ids = [...new Set(requests.map((r) => r.requestedById).filter(Boolean))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } })
      : [];
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    res.json({
      requests: requests.map((r) => {
        const u = r.requestedById ? byId[r.requestedById] : null;
        return {
          ...r,
          squadSize: r.team?.players?.length || 0,
          requester: u ? { id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.phone } : null,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// The caller's own entries for this tournament (requester side). GET
// /join-requests is organiser-gated, so without this a requester couldn't see
// their own pending status — or reach the chat they're half of.
router.get('/:id/my-requests', authMiddleware, async (req, res) => {
  try {
    const rows = await prisma.tournamentTeam.findMany({
      where: { tournamentId: req.params.id, requestedById: req.user.sub },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ requests: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Open (or start) the conversation about a join request. Either party may call
// it; the room is created on first use so requests nobody discusses don't leave
// empty rooms behind. Mirrors the LookingFor connect→chat pattern.
router.post('/:id/join-requests/:teamId/chat', authMiddleware, async (req, res) => {
  try {
    const entry = await prisma.tournamentTeam.findUnique({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId: req.params.teamId } },
      include: {
        team: { select: { name: true } },
        tournament: { select: { name: true, organizerId: true } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Request not found' });

    const uid = req.user.sub;
    const organizerId = entry.tournament?.organizerId;
    const requesterId = entry.requestedById;
    // Nobody to talk to: the organiser added this team directly, or the row
    // predates requestedById. Say so plainly rather than opening an empty room.
    if (!requesterId) return res.status(400).json({ error: 'This team was added by the organiser, so there is no request to discuss.' });
    if (!organizerId) return res.status(400).json({ error: 'This tournament has no organiser to contact.' });
    if (uid !== requesterId && uid !== organizerId) {
      return res.status(403).json({ error: 'Only the organiser and the requester can open this chat.' });
    }
    // The organiser requesting with their own team would put one user in a
    // two-person room talking to themselves.
    if (requesterId === organizerId) return res.status(400).json({ error: 'You organise this tournament.' });

    if (entry.chatRoomId) return res.json({ chatRoomId: entry.chatRoomId, name: `${entry.team?.name} · ${entry.tournament?.name}` });

    const room = await prisma.chatRoom.create({
      data: {
        name: `${entry.team?.name || 'Team'} · ${entry.tournament?.name || 'Tournament'}`,
        type: 'direct',
        members: { create: [{ userId: organizerId }, { userId: requesterId }] },
      },
    });
    await prisma.tournamentTeam.update({ where: { id: entry.id }, data: { chatRoomId: room.id } });
    res.status(201).json({ chatRoomId: room.id, name: room.name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Approve a pending request → the team is now in.
router.post('/:id/join-requests/:teamId/approve', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const entry = await prisma.tournamentTeam.update({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId: req.params.teamId } },
      data: { status: 'approved' },
      include: { team: true },
    });
    await safeNotify(() => notifyTeams([req.params.teamId], {
      title: 'Join request approved',
      message: `${entry.team?.name || 'Your team'} is now in the tournament.`,
      data: { tournamentId: req.params.id },
    }));
    res.json({ entry });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Reject a pending request → remove the entry.
router.post('/:id/join-requests/:teamId/reject', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    // Read before deleting: the row is the only record of who asked, and a
    // decline used to notify nobody at all — the requester just watched their
    // request vanish. The chat room survives, so the reason stays readable.
    const entry = await prisma.tournamentTeam.findUnique({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId: req.params.teamId } },
      include: { team: { select: { name: true } }, tournament: { select: { name: true } } },
    });
    if (!entry) return res.status(404).json({ error: 'Request not found' });

    await prisma.tournamentTeam.delete({ where: { id: entry.id } });

    if (entry.requestedById) {
      await safeNotify(() => notifyUsers([entry.requestedById], {
        title: 'Join request declined',
        message: `${entry.team?.name || 'Your team'} wasn't added to ${entry.tournament?.name || 'the tournament'}.`,
        data: { tournamentId: req.params.id },
      }));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a team from the tournament
router.delete('/:id/teams/:teamId', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    await prisma.tournamentTeam.delete({
      where: {
        tournamentId_teamId: {
          tournamentId: req.params.id,
          teamId: req.params.teamId,
        }
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add fixture (optionally as a phase/series leg)
router.post('/:id/schedule', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { team1Id, team2Id, scheduledAt, venue, round, phaseId, seriesId, leg } = req.body;
    const match = await prisma.tournamentMatch.create({
      data: {
        tournamentId: req.params.id,
        team1Id, team2Id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        venue, round,
        phaseId: phaseId || undefined,
        seriesId: seriesId || undefined,
        leg: leg != null ? Number(leg) : undefined,
      },
    });
    res.status(201).json({ match });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Auto-schedule (Specialized Formats)
router.post('/:id/auto-schedule', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { format = 'classic_t20', autoSplit = true } = req.body;
    
    const tTeams = await prisma.tournamentTeam.findMany({ 
      where: { tournamentId: req.params.id } 
    });
    
    if (tTeams.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 teams to auto-schedule' });
    }
    
    // Clear existing unplayed matches
    await prisma.tournamentMatch.deleteMany({ 
      where: { tournamentId: req.params.id, status: 'scheduled' }
    });

    const matches = [];
    let scheduledDate = new Date();
    scheduledDate.setHours(10, 0, 0, 0); // Default to 10:00 AM
    scheduledDate.setDate(scheduledDate.getDate() + 1); // Start tomorrow

    if (format === 'knockout') {
      // Pure Knockout Logic
      const totalTeams = tTeams.length;
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(totalTeams)));
      const numByes = nextPowerOf2 - totalTeams;
      const numRound1Matches = (totalTeams - numByes) / 2;
      
      const teams = tTeams.map(t => t.teamId);
      
      let teamIndex = 0;
      const round1Winners = [];
      const byes = [];
      
      for (let i = 0; i < numRound1Matches; i++) {
        const t1 = teams[teamIndex++];
        const t2 = teams[teamIndex++];
        matches.push({
          tournamentId: req.params.id,
          team1Id: t1,
          team2Id: t2,
          placeholder1: null,
          placeholder2: null,
          round: 'Round 1',
          scheduledAt: new Date(scheduledDate),
          status: 'scheduled'
        });
        round1Winners.push(`Winner Round 1 M${i + 1}`);
        scheduledDate.setHours(scheduledDate.getHours() + 3); // distinct time per match → stable ordering
      }
      
      while (teamIndex < teams.length) {
        byes.push(teams[teamIndex++]);
      }
      
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      
      let currentRoundTeams = [...byes.map(id => ({ teamId: id })), ...round1Winners.map(name => ({ placeholder: name }))];
      let roundNum = 2;
      
      while (currentRoundTeams.length > 1) {
        const nextRoundTeams = [];
        const isFinal = currentRoundTeams.length === 2;
        const isSF = currentRoundTeams.length === 4;
        const isQF = currentRoundTeams.length === 8;
        const roundName = isFinal ? 'Final' : isSF ? 'Semi-Final' : isQF ? 'Quarter-Final' : `Round ${roundNum}`;
        
        for (let i = 0; i < currentRoundTeams.length; i += 2) {
          const t1 = currentRoundTeams[i];
          const t2 = currentRoundTeams[i + 1];
          matches.push({
            tournamentId: req.params.id,
            team1Id: t1.teamId || null,
            team2Id: t2.teamId || null,
            placeholder1: t1.placeholder || null,
            placeholder2: t2.placeholder || null,
            round: roundName,
            scheduledAt: new Date(scheduledDate),
            status: 'scheduled'
          });
          nextRoundTeams.push({ placeholder: `Winner ${roundName} M${(i/2) + 1}` });
          scheduledDate.setHours(scheduledDate.getHours() + 3); // distinct time per match → stable ordering
        }
        currentRoundTeams = nextRoundTeams;
        roundNum++;
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        scheduledDate.setHours(10, 0, 0, 0);
      }

    } else {
      // League-Based Formats
      const totalTeams = tTeams.length;
      
      // Determine number of groups based on format
      let numGroups = 4; // Default for Sudden-Death and Classic T20
      if (format === 'ipl_style') {
        numGroups = 2;
      } else {
        if (totalTeams < 4) numGroups = 1;
        else if (totalTeams < 8) numGroups = 2;
        else numGroups = 4;
      }
      
      const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const groups = {};
      
      // Collect existing manual assignments or initialize empty groups
      if (!autoSplit) {
        // Collect pre-assigned teams
        for (const t of tTeams) {
          if (t.group) {
            if (!groups[t.group]) groups[t.group] = [];
            groups[t.group].push(t.teamId);
          }
        }
        // Ensure we have numGroups instantiated
        for (let i = 0; i < numGroups; i++) {
          if (!groups[groupNames[i]]) groups[groupNames[i]] = [];
        }
        
        // Find unassigned teams and round-robin assign them
        const unassigned = tTeams.filter(t => !t.group).sort(() => Math.random() - 0.5);
        let currentGroupIdx = 0;
        for (const t of unassigned) {
          const groupName = groupNames[currentGroupIdx];
          groups[groupName].push(t.teamId);
          await prisma.tournamentTeam.update({
            where: { id: t.id },
            data: { group: groupName }
          });
          currentGroupIdx = (currentGroupIdx + 1) % numGroups;
        }
      } else {
        // Auto split completely randomizes
        for (let i = 0; i < numGroups; i++) {
          groups[groupNames[i]] = [];
        }
        const shuffled = [...tTeams].sort(() => Math.random() - 0.5);
        let currentGroupIdx = 0;
        for (const t of shuffled) {
          const groupName = groupNames[currentGroupIdx];
          groups[groupName].push(t.teamId);
          await prisma.tournamentTeam.update({
            where: { id: t.id },
            data: { group: groupName }
          });
          currentGroupIdx = (currentGroupIdx + 1) % numGroups;
        }
      }
      
      // Prepare group states for interleaved generation
      const groupStates = [];
      let maxRounds = 0;
      
      for (let i = 0; i < numGroups; i++) {
        const groupName = groupNames[i];
        const gTeams = groups[groupName];
        if (gTeams.length % 2 !== 0) {
          gTeams.push(null); // Dummy team for BYE
        }
        const numRounds = gTeams.length - 1;
        if (numRounds > maxRounds) maxRounds = numRounds;
        
        groupStates.push({
          name: groupName,
          teams: [...gTeams],
          matchesPerRound: gTeams.length / 2,
          numRounds
        });
      }
      
      // Generate Round Robin interleaved by round
      for (let round = 0; round < maxRounds; round++) {
        for (let i = 0; i < numGroups; i++) {
          const gs = groupStates[i];
          if (round < gs.numRounds) {
            for (let match = 0; match < gs.matchesPerRound; match++) {
              const t1 = gs.teams[match];
              const t2 = gs.teams[gs.teams.length - 1 - match];
              
              if (t1 !== null && t2 !== null) {
                matches.push({
                  tournamentId: req.params.id,
                  team1Id: t1,
                  team2Id: t2,
                  placeholder1: null,
                  placeholder2: null,
                  round: `Group ${gs.name}`,
                  scheduledAt: new Date(scheduledDate),
                  status: 'scheduled'
                });
                
                // Increment date/time for the next match (e.g. 4 hours later)
                scheduledDate.setHours(scheduledDate.getHours() + 4);
                if (scheduledDate.getHours() >= 20) { 
                   // Move to next day, start at 10 AM
                   scheduledDate.setDate(scheduledDate.getDate() + 1);
                   scheduledDate.setHours(10, 0, 0, 0);
                }
              }
            }
            // Rotate teams for this group
            gs.teams.splice(1, 0, gs.teams.pop());
          }
        }
      }
      
      // Advance to Knockouts
      scheduledDate.setDate(scheduledDate.getDate() + 14); // Buffer for knockouts
      
      if (format === 'ipl_style') {
        // IPL Style (Top 2 from 2 Groups -> Qualifier 1, Eliminator, Qualifier 2, Final)
        if (numGroups === 2) {
          // Qualifier 1: 1st Group A vs 1st Group B
          matches.push({
            tournamentId: req.params.id,
            team1Id: null,
            team2Id: null,
            placeholder1: `1st Group ${groupNames[0]}`,
            placeholder2: `1st Group ${groupNames[1]}`,
            round: 'Qualifier 1',
            scheduledAt: new Date(scheduledDate),
            status: 'scheduled'
          });
          
          // Eliminator: 2nd Group A vs 2nd Group B
          matches.push({
            tournamentId: req.params.id,
            team1Id: null,
            team2Id: null,
            placeholder1: `2nd Group ${groupNames[0]}`,
            placeholder2: `2nd Group ${groupNames[1]}`,
            round: 'Eliminator',
            scheduledAt: new Date(scheduledDate),
            status: 'scheduled'
          });
          
          scheduledDate.setDate(scheduledDate.getDate() + 2);
          
          // Qualifier 2: Loser Q1 vs Winner Eliminator
          matches.push({
            tournamentId: req.params.id,
            team1Id: null,
            team2Id: null,
            placeholder1: `Loser Qualifier 1`,
            placeholder2: `Winner Eliminator`,
            round: 'Qualifier 2',
            scheduledAt: new Date(scheduledDate),
            status: 'scheduled'
          });
          
          scheduledDate.setDate(scheduledDate.getDate() + 2);
          
          // Final: Winner Q1 vs Winner Q2
          matches.push({
            tournamentId: req.params.id,
            team1Id: null,
            team2Id: null,
            placeholder1: `Winner Qualifier 1`,
            placeholder2: `Winner Qualifier 2`,
            round: 'Final',
            scheduledAt: new Date(scheduledDate),
            status: 'scheduled'
          });
        }
      } else {
        // Sudden Death or Classic T20
        const topN = format === 'sudden_death' ? 1 : 2; // top 1 for sudden death, top 2 for classic
        let numAdvancing = numGroups * topN;
        
        if (numAdvancing >= 2) {
          const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numAdvancing)));
          const numByes = nextPowerOf2 - numAdvancing;
          
          const knockoutTeams = [];
          for (let i = 0; i < numGroups; i++) {
            knockoutTeams.push({ placeholder: `Group ${groupNames[i]} Winner` });
            if (topN > 1) {
              knockoutTeams.push({ placeholder: `Group ${groupNames[i]} Runner-up` });
            }
          }
          for (let i = 0; i < numByes; i++) {
            knockoutTeams.push({ placeholder: 'BYE' });
          }
          
          // Basic cross seeding
          const winners = knockoutTeams.filter(t => t.placeholder && t.placeholder.includes('Winner'));
          const runners = knockoutTeams.filter(t => t.placeholder && t.placeholder.includes('Runner-up'));
          const byesList = knockoutTeams.filter(t => t.placeholder === 'BYE');
          
          let currentRoundTeams = [];
          for (let i = 0; i < winners.length; i++) {
            currentRoundTeams.push(winners[i]);
            if (runners.length > 0) currentRoundTeams.push(runners.pop());
            else if (byesList.length > 0) currentRoundTeams.push(byesList.pop());
          }
          currentRoundTeams = [...currentRoundTeams, ...runners, ...byesList];
          
          let roundNum = 1;
          while (currentRoundTeams.length > 1) {
            const nextRoundTeams = [];
            const isFinal = currentRoundTeams.length === 2;
            const isSF = currentRoundTeams.length === 4;
            const isQF = currentRoundTeams.length === 8;
            const roundName = isFinal ? 'Final' : isSF ? 'Semi-Final' : isQF ? 'Quarter-Final' : `Knockout R${roundNum}`;
            
            for (let i = 0; i < currentRoundTeams.length; i += 2) {
              const t1 = currentRoundTeams[i];
              const t2 = currentRoundTeams[i + 1] || { placeholder: 'TBD' };
              
              if (t2.placeholder === 'BYE') {
                nextRoundTeams.push(t1);
              } else if (t1.placeholder === 'BYE') {
                nextRoundTeams.push(t2);
              } else {
                matches.push({
                  tournamentId: req.params.id,
                  team1Id: null,
                  team2Id: null,
                  placeholder1: t1.placeholder || null,
                  placeholder2: t2.placeholder || null,
                  round: roundName,
                  scheduledAt: new Date(scheduledDate),
                  status: 'scheduled'
                });
                nextRoundTeams.push({ placeholder: `Winner ${roundName} M${(i/2) + 1}` });
                scheduledDate.setHours(scheduledDate.getHours() + 3); // distinct time per match → stable ordering
              }
            }
            currentRoundTeams = nextRoundTeams;
            roundNum++;
            scheduledDate.setDate(scheduledDate.getDate() + 1);
            scheduledDate.setHours(10, 0, 0, 0);
          }
        }
      }
    }

    if (matches.length > 0) {
      await prisma.tournamentMatch.createMany({ data: matches });
    }

    // Notify every participant that the fixtures are out. Awaited before
    // responding (serverless suspends post-response work).
    if (matches.length > 0) {
      const tourney = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { name: true } });
      await safeNotify(() => notifyAllParticipants(req.params.id, {
        title: 'Schedule released',
        message: `The fixtures for ${tourney?.name || 'your tournament'} are out — ${matches.length} matches scheduled.`,
        data: { tournamentId: req.params.id },
      }));
    }
    res.json({ success: true, count: matches.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update points row after a match result
router.put('/:id/points-table/:teamId', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const data = req.body;
    const row = await prisma.tournamentTeam.update({
      where: { tournamentId_teamId: { tournamentId: req.params.id, teamId: req.params.teamId } },
      data,
      include: { team: true },
    });
    res.json({ row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const TournamentSchema = z.object({
  name:        z.string().min(1),
  format:      z.string().min(1),
  overs:       z.number().int().optional(),
  ballType:    z.string().optional(),
  status:      z.string().min(1),
  startDate:   z.string().datetime().optional(),
  endDate:     z.string().datetime().optional(),
  venue:       z.string().optional(),
  maxTeams:    z.number().int().optional(),
  prizePool:   z.string().optional(),
  description: z.string().optional(),
  organizer:   z.string().optional(),
  sport:       z.string().optional(),   // was dropped → every tournament saved as cricket
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = TournamentSchema.parse(req.body);
    // Stamp the creator as organiser — this id gates every admin action later.
    const t = await prisma.tournament.create({ data: { ...data, organizerId: req.user.sub } });
    res.status(201).json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Assign groups manually
router.put('/:id/assign-groups', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { assignments } = req.body; // array of { id: tournamentTeamId, group: string }
    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Missing assignments array' });
    }
    
    // Batch update
    for (const a of assignments) {
      await prisma.tournamentTeam.update({
        where: { id: a.id },
        data: { group: a.group }
      });
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update a tournament (whitelisted fields) — powers the "Start" button
// (upcoming → ongoing) and completing/rescheduling from the app.
router.put('/:id', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { status, startDate, endDate, venue, prizePool, maxTeams } = req.body;
    const t = await prisma.tournament.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(venue !== undefined && { venue }),
        ...(prizePool !== undefined && { prizePool }),
        ...(maxTeams !== undefined && { maxTeams }),
      },
    });
    res.json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
