import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';
import { mentionedUserIds, memberName } from '../lib/mentions.js';

const router = Router();

// Poll votes live in the polymorphic Like table — no new table, the same
// pattern saved posts and player follows use. One row per (user, option):
// targetId is `<messageId>:<optionIndex>`, and the table's unique constraint on
// (userId, targetType, targetId) is exactly "you may vote for this option once".
// Multi-select therefore needs no extra rule; single-select is the one that
// needs enforcing, by clearing the voter's other options for that message.
const VOTE_TYPE = 'poll_vote';
const voteTarget = (messageId, i) => `${messageId}:${i}`;
const MAX_OPTIONS = 12;

/**
 * Tell the rest of the room. Shared by plain messages and polls, so a poll
 * announces itself exactly as a message does.
 *
 * A chat is the one place where a missing notification means the feature does
 * not work at all: a message nobody is told about is a message nobody reads
 * until they happen to open the app.
 *
 * Awaited before responding, like every notify in this codebase — on Vercel
 * serverless the function can be frozen the moment the response is flushed, so
 * work deferred past it is not guaranteed to run. Inside safeNotify, so it can
 * never fail the message it is announcing.
 */
async function notifyRoom(message, senderId, bodyOverride) {
  const members = message.chatRoom?.members || [];
  const others = members.map((m) => m.userId).filter((id) => id && id !== senderId);
  if (!others.length) return 0;
  const from = [message.sender?.firstName, message.sender?.lastName]
    .filter(Boolean).join(' ').trim() || 'Someone';
  const room = message.chatRoom?.name || 'Chat';
  const text = (bodyOverride || message.text).slice(0, 80);

  // A GROUP is titled by the room and needs the speaker named in the body —
  // "D-Vigo-S XI · Team Chat" / "Mani BP: practice at 6".
  //
  // A ONE-TO-ONE is titled by the person, and naming them again in the body
  // would be saying it twice. It also must NOT be titled by the room: these
  // rooms are named after the Scout listing that started them, so every direct
  // message arrived as "Looking for a Player · Wicket-keeper · T20" — the
  // advert, not the human typing.
  const group = message.chatRoom?.type === 'team' || message.chatRoom?.type === 'tournament';
  const title = group ? room : from;
  const body = group ? `${from}: ${text}` : text;
  const data = { chatId: message.chatRoomId, chatName: group ? room : from };

  // Being named is a different event from a message arriving, so it says so.
  // In a room that has been talking all afternoon, "Mani BP mentioned you" is
  // the one line worth interrupting for, and it has to be distinguishable on a
  // lock screen from the forty that are not about you.
  const named = new Set(
    mentionedUserIds(message.text, members.map((m) => ({
      userId: m.userId, name: memberName(m.user),
    }))).filter((id) => id !== senderId),
  );

  return safeNotify(async () => {
    let sent = 0;
    if (named.size) {
      sent += await notifyUsers([...named], {
        type: 'chat',
        title: `${from} mentioned you`,
        // The room only earns a place when there is a room to distinguish —
        // in a one-to-one, "X mentioned you" already says where.
        message: group ? `${room} · ${text}` : text,
        data,
      });
    }
    const rest = others.filter((id) => !named.has(id));
    if (rest.length) {
      sent += await notifyUsers(rest, {
        // Its own type so it lands on its own Android channel: a busy group
        // chat must be silenceable without also silencing match alerts.
        type: 'chat',
        title,
        message: body,
        data,
      });
    }
    return sent;
  });
}

/**
 * Fold vote rows into per-message tallies.
 *
 * Returns { [messageId]: { votes: number[], myVotes: number[], voters: n } }.
 * One query for a whole page of messages rather than one per poll.
 */
async function tallyPolls(messages, viewerId) {
  const polls = messages.filter((m) => m.kind === 'poll');
  if (!polls.length) return {};
  const targets = polls.flatMap((m) =>
    (m.poll?.options || []).map((_, i) => voteTarget(m.id, i)));
  if (!targets.length) return {};
  const rows = await prisma.like.findMany({
    where: { targetType: VOTE_TYPE, targetId: { in: targets } },
    select: { targetId: true, userId: true },
  });
  const out = {};
  for (const m of polls) {
    const n = (m.poll?.options || []).length;
    out[m.id] = { votes: Array(n).fill(0), myVotes: [], voters: 0 };
  }
  const seenVoter = {};
  for (const r of rows) {
    const idx = r.targetId.lastIndexOf(':');
    const mid = r.targetId.slice(0, idx);
    const opt = Number(r.targetId.slice(idx + 1));
    const t = out[mid];
    if (!t || !Number.isInteger(opt) || opt < 0 || opt >= t.votes.length) continue;
    t.votes[opt] += 1;
    if (r.userId === viewerId) t.myVotes.push(opt);
    // A multi-select voter picking three options is still one voter, which is
    // what "12 votes" under a poll has to mean.
    (seenVoter[mid] ||= new Set()).add(r.userId);
  }
  for (const mid of Object.keys(out)) out[mid].voters = seenVoter[mid]?.size || 0;
  return out;
}

// Get chat rooms for user
// Every room you're in, newest activity first, with an unread count.
//
// This endpoint existed but nothing ever called it — there was no chat list
// screen. Serving it raw wasn't enough to build one on: rooms came back in
// membership order (so a dead room could sit above a live one), members carried
// no avatar, and there was no unread signal at all despite ChatMember.lastReadAt
// being right there.
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const memberships = await prisma.chatMember.findMany({
      where: { userId: me },
      include: {
        chatRoom: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
          },
        },
      },
    });

    // Unread = messages someone else sent since you last opened the room. Counted
    // per room because lastReadAt is per membership; a user is in a handful of
    // rooms, so a bounded fan-out is cheaper than over-fetching every message.
    const rooms = await Promise.all(memberships.map(async (m) => {
      const unreadCount = await prisma.chatMessage.count({
        where: {
          chatRoomId: m.chatRoomId,
          senderId: { not: me },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      const last = m.chatRoom.messages[0] || null;
      return {
        ...m.chatRoom,
        unreadCount,
        lastMessage: last ? { text: last.text, createdAt: last.createdAt, senderId: last.senderId } : null,
        lastActivityAt: last?.createdAt || m.chatRoom.createdAt,
      };
    }));

    // Newest activity first — an empty room falls back to when it was created,
    // so a just-opened conversation still surfaces at the top.
    rooms.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
    res.json({ rooms });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a chat room
router.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const { name, type, memberIds } = req.body;
    const room = await prisma.chatRoom.create({
      data: {
        name: name || 'New Chat',
        type: type || 'team',
        members: {
          create: [
            { userId: req.user.sub },
            ...(memberIds || []).map(id => ({ userId: id })),
          ],
        },
      },
      include: { members: true },
    });
    res.status(201).json({ room });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get messages for a room (polling)
router.get('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { after } = req.query;
    const where = { chatRoomId: req.params.roomId };
    if (after) {
      where.createdAt = { gt: new Date(after) };
    }
    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    // Reading the room marks it read, so unread badges elsewhere clear on their
    // own. The client polls this endpoint every couple of seconds, so only write
    // when it can change something: the initial open (no `after`), or a poll
    // that actually returned new messages. Otherwise every idle poll would be a
    // pointless round-trip to the database.
    // updateMany (not update) so a non-member reading a room they aren't in is a
    // no-op rather than an error.
    if (!after || messages.length) {
      await prisma.chatMember.updateMany({
        where: { chatRoomId: req.params.roomId, userId: req.user.sub },
        data: { lastReadAt: new Date() },
      });
    }
    // Tallies ride along with the messages. Results fetched in a second request
    // would draw empty bars and fill them a beat later, and this endpoint is
    // polled every few seconds — that flicker would be permanent, not momentary.
    const tallies = await tallyPolls(messages, req.user.sub);
    res.json({
      messages: messages.map((m) => (tallies[m.id] ? { ...m, tally: tallies[m.id] } : m)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /chat/unread — one number for the header badge.
//
// The rooms list already counts unread per room, but the header cannot pay for
// that: it would fetch every room, its members and its last message on every
// screen focus, to draw a dot. This is one aggregate query over the rooms you
// are in, using each membership's own lastReadAt — a room you have never opened
// counts everything in it, which is what "unread" means there.
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const me = req.user.sub;
    const memberships = await prisma.chatMember.findMany({
      where: { userId: me }, select: { chatRoomId: true, lastReadAt: true },
    });
    if (!memberships.length) return res.json({ unread: 0, rooms: 0 });

    // Your own messages are never unread to you.
    const clauses = memberships.map((m) => ({
      chatRoomId: m.chatRoomId,
      senderId: { not: me },
      ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
    }));

    const [unread, withUnread] = await Promise.all([
      prisma.chatMessage.count({ where: { OR: clauses } }),
      // How many CONVERSATIONS are waiting, which is the more useful number on
      // a chat icon — twenty messages in one room is still one room to open.
      prisma.chatMessage.findMany({
        where: { OR: clauses }, select: { chatRoomId: true }, distinct: ['chatRoomId'],
      }),
    ]);
    res.json({ unread, rooms: withUnread.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /chat/rooms/:roomId/members — who is in the room.
//
// The composer needs this to offer names after an "@". Members only: the list
// is who you can address, and it is also who can read what you write.
router.get('/rooms/:roomId/members', authMiddleware, async (req, res) => {
  try {
    const mine = await prisma.chatMember.findFirst({
      where: { chatRoomId: req.params.roomId, userId: req.user.sub }, select: { id: true },
    });
    if (!mine) return res.status(403).json({ error: 'You are not in this chat' });
    const rows = await prisma.chatMember.findMany({
      where: { chatRoomId: req.params.roomId },
      select: { userId: true, user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    res.json({
      members: rows
        .map((r) => ({ userId: r.userId, name: memberName(r.user), avatarUrl: r.user?.avatarUrl || null }))
        .filter((m) => m.name),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Polls ────────────────────────────────────────────────────────────────────

const PollSchema = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(MAX_OPTIONS),
  multi: z.boolean().optional().default(false),
});

// POST /chat/rooms/:roomId/polls — a poll is a message with a kind.
router.post('/rooms/:roomId/polls', authMiddleware, async (req, res) => {
  try {
    const data = PollSchema.parse(req.body);
    // De-duplicated AFTER trimming and before the count is judged, so "A, A"
    // is one option and fails rather than becoming a two-way poll with one
    // answer written twice.
    const options = [...new Set(data.options.map((o) => o.trim()).filter(Boolean))];
    if (options.length < 2) return res.status(400).json({ error: 'A poll needs at least two different options' });

    const member = await prisma.chatMember.findFirst({
      where: { chatRoomId: req.params.roomId, userId: req.user.sub }, select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'You are not in this chat' });

    const message = await prisma.chatMessage.create({
      data: {
        chatRoomId: req.params.roomId,
        senderId: req.user.sub,
        text: data.question,          // doubles as preview and push body
        kind: 'poll',
        poll: { options, multi: !!data.multi },
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        // Names too, not just ids: notifyRoom has to work out who the text
        // mentions, and that needs the members' names.
        chatRoom: {
          select: {
            name: true,
            // `type` decides what a notification is titled — a one-to-one room
            // is named after the Scout listing that started it, which is not
            // who is talking to you. See notifyRoom.
            type: true,
            members: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    await notifyRoom(message, req.user.sub, `Poll: ${data.question}`);

    const { chatRoom, ...msg } = message;
    res.status(201).json({
      message: { ...msg, tally: { votes: options.map(() => 0), myVotes: [], voters: 0 } },
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /chat/messages/:id/vote — toggle one option.
//
// A toggle, not a set: tapping your own choice again takes it back, which is
// what every poll people have used already does. A single-choice poll clears
// the voter's other options in the same breath, so changing your mind is one
// tap rather than un-vote then vote.
router.post('/messages/:id/vote', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.sub;
    const optionIndex = Number(req.body?.optionIndex);
    const message = await prisma.chatMessage.findUnique({
      where: { id: req.params.id },
      select: { id: true, kind: true, poll: true, chatRoomId: true },
    });
    if (!message || message.kind !== 'poll') return res.status(404).json({ error: 'Poll not found' });

    const options = message.poll?.options || [];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
      return res.status(400).json({ error: 'Unknown option' });
    }
    // Members only. Without this the poll is open to anyone who can guess a
    // message id.
    const member = await prisma.chatMember.findFirst({
      where: { chatRoomId: message.chatRoomId, userId }, select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'You are not in this chat' });

    const target = voteTarget(message.id, optionIndex);
    const key = { userId_targetType_targetId: { userId, targetType: VOTE_TYPE, targetId: target } };
    const existing = await prisma.like.findUnique({ where: key });
    if (existing) {
      await prisma.like.delete({ where: key });
    } else {
      if (!message.poll?.multi) {
        await prisma.like.deleteMany({
          where: { userId, targetType: VOTE_TYPE, targetId: { in: options.map((_, i) => voteTarget(message.id, i)) } },
        });
      }
      await prisma.like.create({ data: { userId, targetType: VOTE_TYPE, targetId: target } });
    }

    const tallies = await tallyPolls([message], userId);
    res.json({ tally: tallies[message.id] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Send a message
router.post('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });
    const message = await prisma.chatMessage.create({
      data: {
        chatRoomId: req.params.roomId,
        senderId: req.user.sub,
        text: text.trim(),
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        // Names too, not just ids: notifyRoom has to work out who the text
        // mentions, and that needs the members' names.
        chatRoom: {
          select: {
            name: true,
            // `type` decides what a notification is titled — a one-to-one room
            // is named after the Scout listing that started it, which is not
            // who is talking to you. See notifyRoom.
            type: true,
            members: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    await notifyRoom(message, req.user.sub);

    res.status(201).json({ message });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
