import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuth } from '../lib/auth.js';
import { computeStandings, computeStageStandings } from '../lib/standings.js';
import { applyTournamentResult } from '../lib/tournamentResult.js';
import { notifyTeams, notifyUsers, notifyAllParticipants, safeNotify } from '../lib/notify.js';
import { tournamentLeaderboard } from '../lib/leaderboard.js';
import { tournamentStats } from '../lib/teamStats.js';
import { seriesAwards } from '../lib/awards.js';
import { zonedTime } from '../lib/zonedTime.js';
import { canonicalVenue } from '../lib/venue.js';

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
    // `standings` is the whole tournament as one table — kept because installed
    // clients read it. `stages` is one table per stage, which is what a
    // tournament with a group phase and a Super 8 actually has; a client that
    // understands it should prefer it.
    const [standings, stages] = await Promise.all([
      computeStandings(req.params.id),
      computeStageStandings(req.params.id),
    ]);
    res.json({ standings, stages });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Tournament leaderboard: Orange Cap (runs), Purple Cap (wickets), MVP — from
// the ball-by-ball data of every fixture played through a real match.
//
// `awards` rides along: Player of the Series and the best batter / bowler /
// fielder of it, summed from the match awards already filed for each fixture.
// They're recomputed on every read so a running tournament shows who is leading
// the honours; the copy written when the last fixture lands is the permanent
// record a career counts (lib/awards.js).
//
// Note `mvp` in this payload is a different, older thing: a fantasy-points
// ranking (runs + boundaries + 20/wicket) that predates the MVP algorithm the
// match awards use. It stays for older clients; `awards` is the real honour.
// The full board set — the same thirty-five the team page shows, over this
// tournament's fixtures. `/leaderboard` above stays as it is: it feeds the
// existing Orange/Purple/MVP strip and the awards, and is a different shape.
router.get('/:id/stats', async (req, res) => {
  try {
    res.json(await tournamentStats(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/leaderboard', async (req, res) => {
  try {
    const [board, awards] = await Promise.all([
      tournamentLeaderboard(req.params.id),
      seriesAwards(req.params.id),
    ]);
    res.json({ ...board, awards });
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

router.get('/:id', optionalAuth, async (req, res) => {
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
  // The organiser's phone, WhatsApp and email exist so a captain can ask about
  // entering — not so anyone holding a tournament id can scrape them. This
  // route takes no token, so contact details go to signed-in callers only.
  if (!req.user) tournament.contact = null;
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
      // The phase is what says whether a fixture is a group game or a knockout.
      // Without it the app had to guess from the round LABEL — and guessed that
      // "Super 8 Group 1" was a knockout round, because the test was whether the
      // label starts with "Group ". A 20-team tournament put twelve round-robin
      // fixtures into the bracket.
      //
      // It costs one extra query. Measured at ~0.3s from a laptop, which is one
      // Atlantic round trip and not what this route pays on Vercel, sitting in
      // the same region as the database.
      include: { phase: { select: { id: true, name: true, type: true, order: true } } },
    });
    // TournamentMatch holds team1Id/team2Id as plain columns with no relation,
    // so the teams have to be fetched separately. This was a findUnique per
    // side inside a Promise.all, which LOOKS like an N+1 and is not: Prisma's
    // dataloader coalesces findUnique-by-id issued in the same tick into a
    // single WHERE id IN (…). Measured on this tournament, 110 findUnique calls
    // are 1 SQL query — the same as the findMany below. Written out only
    // because one query that says so beats 110 that rely on knowing that.
    const ids = [...new Set(matches.flatMap((m) => [m.team1Id, m.team2Id]).filter(Boolean))];
    const teams = await prisma.team.findMany({ where: { id: { in: ids } } });
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
    const enriched = matches.map((m) => ({
      ...m,
      team1: m.team1Id ? byId[m.team1Id] || null : null,
      team2: m.team2Id ? byId[m.team2Id] || null : null,
    }));
    res.json({ schedule: enriched });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Register a team in the tournament
router.post('/:id/teams', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { teamId, group = 'A' } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    // Sport isolation: a team can only enter a tournament of its own sport.
    const [tournament, team] = await Promise.all([
      prisma.tournament.findUnique({ where: { id: req.params.id }, select: { sport: true, name: true, maxTeams: true } }),
      prisma.team.findUnique({ where: { id: teamId }, select: { sport: true, name: true } }),
    ]);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.sport !== tournament.sport) {
      return res.status(400).json({ error: `Sport mismatch: ${team.name} is a ${team.sport} team but ${tournament.name} is a ${tournament.sport} tournament.` });
    }
    // The maximum is the organiser's own number, and it is not decoration: the
    // fixture generator draws from whoever is approved, so a 17th team in a
    // 16-team knockout produces a bracket that doesn't resolve. Their tournament
    // — they can raise the maximum in Edit — but not by accident.
    if (tournament.maxTeams) {
      const taken = await prisma.tournamentTeam.count({
        where: { tournamentId: req.params.id, status: 'approved', teamId: { not: teamId } },
      });
      if (taken >= tournament.maxTeams) {
        return res.status(409).json({
          error: `${tournament.name} is full — ${taken} of ${tournament.maxTeams} teams. Raise the maximum or remove a team first.`,
        });
      }
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
    const { teamId, group = 'A', note } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    const [tournament, team] = await Promise.all([
      prisma.tournament.findUnique({
        where: { id: req.params.id },
        select: {
          sport: true, name: true, organizerId: true, status: true, maxTeams: true,
          flags: true, registration: true, regWindow: true,
        },
      }),
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
    // The create wizard collects a whole registration policy — invite only, a
    // closing date, a maximum, a "teams can request to join" switch — and none
    // of it was enforced anywhere. A tournament that had closed, or was invite
    // only, or was already full at its own stated maximum, accepted requests
    // exactly like one that was open. Refusing here is what makes those answers
    // mean something; the app hides the button, but the button is not the gate.
    if (['completed', 'cancelled'].includes(tournament.status)) {
      return res.status(409).json({ error: `${tournament.name} has finished.` });
    }
    if (tournament.flags && tournament.flags.teamRegistration === false) {
      return res.status(409).json({ error: `${tournament.name} is not taking team registrations.` });
    }
    if (tournament.registration?.type === 'invite') {
      return res.status(409).json({ error: `${tournament.name} is invite only — the organiser adds teams.` });
    }
    const closesAt = tournament.regWindow?.closesAt ? new Date(tournament.regWindow.closesAt) : null;
    if (closesAt && closesAt < new Date()) {
      return res.status(409).json({ error: `Registration for ${tournament.name} closed on ${closesAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.` });
    }
    if (tournament.maxTeams) {
      const taken = await prisma.tournamentTeam.count({
        where: { tournamentId: req.params.id, status: 'approved' },
      });
      if (taken >= tournament.maxTeams) {
        return res.status(409).json({ error: `${tournament.name} is full (${taken} of ${tournament.maxTeams} teams).` });
      }
    }

    const entry = await prisma.tournamentTeam.create({
      data: {
        tournamentId: req.params.id, teamId, group, status: 'pending', requestedById: req.user.sub,
        // Trimmed and capped: it's a one-line pitch on a card, not a document.
        requestNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 280) : null,
      },
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
    const teamIds = requests.map((r) => r.teamId);
    const roomIds = requests.map((r) => r.chatRoomId).filter(Boolean);

    const [users, played, myMemberships] = await Promise.all([
      ids.length
        ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } })
        : [],
      // The team's record, so the organiser can judge without asking. Same
      // derivation as GET /teams: Match.result is free text, matched against the
      // team's own name; a tie counts as played but neither won nor lost.
      teamIds.length
        ? prisma.match.findMany({
            where: { status: 'completed', OR: [{ team1Id: { in: teamIds } }, { team2Id: { in: teamIds } }] },
            select: { team1Id: true, team2Id: true, result: true },
          })
        : [],
      // Unread replies waiting for the organiser in each request's room.
      roomIds.length
        ? prisma.chatMember.findMany({ where: { chatRoomId: { in: roomIds }, userId: req.user.sub }, select: { chatRoomId: true, lastReadAt: true } })
        : [],
    ]);

    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const nameOfTeam = Object.fromEntries(requests.map((r) => [r.teamId, r.team?.name]));
    const rec = {};
    for (const id of teamIds) rec[id] = { matches: 0, wins: 0, losses: 0 };
    for (const m of played) {
      for (const id of [m.team1Id, m.team2Id]) {
        if (!rec[id]) continue;
        rec[id].matches += 1;
        const res2 = m.result || '';
        if (!res2 || /tie/i.test(res2)) continue;
        if (nameOfTeam[id] && res2.startsWith(nameOfTeam[id])) rec[id].wins += 1;
        else rec[id].losses += 1;
      }
    }

    const readBy = Object.fromEntries(myMemberships.map((m) => [m.chatRoomId, m.lastReadAt]));
    const unreadCounts = await Promise.all(requests.map((r) => {
      if (!r.chatRoomId) return 0;
      const since = readBy[r.chatRoomId];
      return prisma.chatMessage.count({
        where: {
          chatRoomId: r.chatRoomId,
          senderId: { not: req.user.sub },              // your own messages aren't unread
          ...(since ? { createdAt: { gt: since } } : {}),
        },
      });
    }));

    res.json({
      requests: requests.map((r, i) => {
        const u = r.requestedById ? byId[r.requestedById] : null;
        return {
          ...r,
          squadSize: r.team?.players?.length || 0,
          record: rec[r.teamId],
          unread: unreadCounts[i] || 0,
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
        type: 'tournament',
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

// Remove a team from the tournament.
//
// Organiser-only, and there is deliberately no self-withdrawal: once a team is
// in, it is in (docs/TOURNAMENT_DESIGN.md §4.2). A team that stops turning up
// forfeits its remaining fixtures rather than leaving, because a mid-tournament
// exit rewrites every opponent's record depending on whether they had already
// played it.
//
// Which is also why this delete is guarded. It drops the TournamentTeam row
// outright, so removing a team that has already played orphans those results:
// the matches survive and still count against the other side, while the team
// itself is gone from the standings. Allowed only before they have played.
router.delete('/:id/teams/:teamId', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const played = await prisma.tournamentMatch.count({
      where: {
        tournamentId: req.params.id,
        status: 'completed',
        OR: [{ team1Id: req.params.teamId }, { team2Id: req.params.teamId }],
      },
    });
    if (played > 0) {
      return res.status(409).json({
        error: 'This team has already played. Removing it would leave those results counting against their opponents — forfeit their remaining fixtures instead.',
      });
    }
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
        venue: canonicalVenue(venue), round,
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

    // Approved only. Without the filter a pending join request — a team that
    // asked and hasn't been admitted — was drawn into the fixture list exactly
    // like a registered one, and the organiser rejecting it afterwards left a
    // fixture against a team that isn't in the tournament.
    const tTeams = await prisma.tournamentTeam.findMany({
      where: { tournamentId: req.params.id, status: 'approved' },
    });

    if (tTeams.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 approved teams to auto-schedule' });
    }
    
    // Clear existing unplayed matches
    await prisma.tournamentMatch.deleteMany({ 
      where: { tournamentId: req.params.id, status: 'scheduled' }
    });

    const matches = [];
    // The tournament already says when it starts and what time the first ball
    // is — the create wizard asks for both. This generator ignored them and
    // began "tomorrow at 10:00", so a tournament starting next August got
    // fixtures dated this week. Its own dates now win; tomorrow is the fallback
    // for a tournament that never set one.
    const tourney = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { startDate: true, regWindow: true },
    });
    const [startHour, startMin] = String(tourney?.regWindow?.startTime || '10:00')
      .split(':').map((n) => Number(n) || 0);
    // The time is the tournament's, in the tournament's zone. setHours would use
    // the SERVER's — fine on a laptop in Chennai, and four and a half hours out
    // on Vercel, which runs in UTC.
    const tz = tourney?.regWindow?.timeZone || null;
    const firstDay = tourney?.startDate
      ? new Date(tourney.startDate)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    let scheduledDate = zonedTime(firstDay, startHour, startMin, tz);

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

      // Each match day starts at the tournament's own first-ball time. Matches
      // within a day are spaced 3 hours apart for ordering; without resetting
      // here, that spacing carried into the next round, so a four-round
      // knockout drifted the final nine hours later than the first game.
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      scheduledDate = zonedTime(scheduledDate, startHour, startMin, tz);
      
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
        scheduledDate = zonedTime(scheduledDate, startHour, startMin, tz);
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

// ICC's bowling quota: nobody bowls more than a fifth of the innings. 20 overs
// → 4, 50 → 10, and an innings that doesn't divide by five rounds up (a 6-over
// game allows 2). The client shows this as a hint; the server is what enforces
// it, because a hint is only ever advice.
const maxOversPerBowler = (overs) => (overs > 0 ? Math.ceil(overs / 5) : null);

// Anything not listed here is dropped by zod without a word — which is exactly
// how the logo and banner the create screen uploads went missing for so long.
const TournamentFields = z.object({
  name:        z.string().min(1),
  shortName:   z.string().max(10).optional(),
  format:      z.string().min(1),
  category:    z.string().optional(),
  overs:       z.number().int().positive().optional(),
  ballType:    z.string().optional(),
  status:      z.string().min(1),
  startDate:   z.string().datetime().optional(),
  endDate:     z.string().datetime().optional(),
  venue:       z.string().optional().transform(canonicalVenue),
  city:        z.string().optional(),
  maxTeams:    z.number().int().optional(),
  prizePool:   z.string().optional(),
  description: z.string().optional(),
  organizer:   z.string().optional(),
  sport:       z.string().optional(),   // was dropped → every tournament saved as cricket
  logoUrl:     z.string().optional(),
  banner:      z.string().optional(),

  // Grouped configuration — see the note on the model. Passthrough on each
  // block so adding a rule to the app doesn't need a server release, while the
  // fields the server validates below stay typed.
  contact:      z.object({
    phone:    z.string().optional(),
    email:    z.string().email().optional().or(z.literal('')),
    website:  z.string().optional(),
    whatsapp: z.string().optional(),
  }).passthrough().optional(),
  location:     z.object({
    ground:  z.string().optional(),
    address: z.string().optional(),
    state:   z.string().optional(),
    country: z.string().optional(),
  }).passthrough().optional(),
  regWindow:    z.object({
    opensAt:   z.string().datetime().optional(),
    closesAt:  z.string().datetime().optional(),
    startTime: z.string().optional(),   // "HH:mm", first ball of a match day
    timeZone:  z.string().optional(),
  }).passthrough().optional(),
  registration: z.object({
    minTeams:    z.number().int().nonnegative().optional(),
    minPlayers:  z.number().int().nonnegative().optional(),
    maxPlayers:  z.number().int().nonnegative().optional(),
    playingXi:   z.number().int().positive().optional(),
    substitutes: z.number().int().nonnegative().optional(),
    entryFee:    z.number().nonnegative().optional(),
    currency:    z.string().optional(),
    type:        z.enum(['open', 'invite', 'approval']).optional(),
  }).passthrough().optional(),
  rules:        z.object({
    powerplayOvers:    z.number().int().nonnegative().optional(),
    maxOversPerBowler: z.number().int().positive().optional(),
  }).passthrough().optional(),
  pointsRules:  z.object({
    win:      z.number().optional(),
    tie:      z.number().optional(),
    noResult: z.number().optional(),
    loss:     z.number().optional(),
    bonus:    z.boolean().optional(),
    tieBreak: z.array(z.string()).optional(),
  }).passthrough().optional(),
  prizes:       z.object({}).passthrough().optional(),
  // How to draw the images. bannerFocus is the point kept visible when a wide
  // cover is cropped short; 0..1 each, clamped so a bad client can't push the
  // crop off the image.
  media:        z.object({
    bannerFocus: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }).optional(),
  }).passthrough().optional(),
  flags:        z.object({}).passthrough().optional(),
});

// Cross-field rules. Each of these is a tournament that can be created but
// never run: fixtures that start before teams can enter, a playing XI larger
// than the squad it's picked from, a minimum nobody can reach.
//
// Every check guards on the fields being present, so the same function serves
// the partial body of an edit — an edit that only changes the venue isn't asked
// to prove the dates it didn't touch.
const crossFieldRules = (d, ctx) => {
    const err = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const start = d.startDate ? new Date(d.startDate) : null;
    const end = d.endDate ? new Date(d.endDate) : null;
    const closes = d.regWindow?.closesAt ? new Date(d.regWindow.closesAt) : null;
    const opens = d.regWindow?.opensAt ? new Date(d.regWindow.opensAt) : null;
    const r = d.registration || {};

    if (start && end && end < start) err(['endDate'], 'The tournament cannot end before it starts');
    if (opens && closes && closes < opens) err(['regWindow', 'closesAt'], 'Registration cannot close before it opens');
    if (closes && start && closes > start) err(['regWindow', 'closesAt'], 'Registration must close before the first match');
    if (r.minPlayers != null && r.maxPlayers != null && r.minPlayers > r.maxPlayers)
      err(['registration', 'minPlayers'], 'Minimum players cannot exceed the maximum');
    if (r.playingXi != null && r.maxPlayers != null && r.playingXi > r.maxPlayers)
      err(['registration', 'playingXi'], 'The playing XI cannot be bigger than the squad');
    if (r.minTeams != null && d.maxTeams != null && r.minTeams > d.maxTeams)
      err(['registration', 'minTeams'], 'Minimum teams cannot exceed the maximum');

    const quota = maxOversPerBowler(d.overs);
    if (quota && d.rules?.maxOversPerBowler && d.rules.maxOversPerBowler > quota)
      err(['rules', 'maxOversPerBowler'], `A bowler may bowl at most ${quota} of ${d.overs} overs`);
    if (d.rules?.powerplayOvers != null && d.overs && d.rules.powerplayOvers > d.overs)
      err(['rules', 'powerplayOvers'], 'The powerplay cannot be longer than the innings');
};

const TournamentSchema = TournamentFields.superRefine(crossFieldRules);
// Same fields, all optional: an edit sends what changed.
const TournamentUpdateSchema = TournamentFields.partial().superRefine(crossFieldRules);

// zod's message for a failed .parse is a JSON dump of every issue — fine in a
// log, unreadable in the toast the app shows. Send the first real sentence.
const firstIssue = (e) =>
  (e?.issues?.length ? e.issues[0].message : null) || e?.message || 'Invalid tournament';

router.post('/', authMiddleware, async (req, res) => {
  try {
    const data = TournamentSchema.parse(req.body);
    // Stamp the creator as organiser — this id gates every admin action later.
    const t = await prisma.tournament.create({ data: { ...data, organizerId: req.user.sub } });
    res.status(201).json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: firstIssue(e) });
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
    // Was a six-field whitelist — status, dates, venue, prizePool, maxTeams —
    // against a create screen that collects sixty. The logo, the ground, the
    // entry fee, the squad limits, the rules, the points system, the prizes and
    // every way of contacting the organiser could be set once and never
    // corrected. A typo in the name was permanent.
    //
    // Same fields as create, all optional, same cross-field validation. Only
    // what's sent is written, so an edit that changes the venue leaves the
    // ninety other columns alone.
    const data = TournamentUpdateSchema.parse(req.body);
    const t = await prisma.tournament.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ tournament: t });
  } catch (e) {
    res.status(400).json({ error: firstIssue(e) });
  }
});

export default router;
