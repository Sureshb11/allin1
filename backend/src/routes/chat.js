import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';
import { notifyUsers, safeNotify } from '../lib/notify.js';

const router = Router();

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
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
        chatRoom: { select: { name: true, members: { select: { userId: true } } } },
      },
    });

    // Everyone else in the room. A chat is the one place where a missing
    // notification means the feature does not work at all: a message nobody is
    // told about is a message nobody reads until they happen to open the app.
    //
    // Awaited before responding, like every other notify in this codebase: on
    // Vercel serverless the function can be frozen the moment the response is
    // flushed, so work deferred past it is not guaranteed to run.
    const others = (message.chatRoom?.members || [])
      .map((m) => m.userId)
      .filter((id) => id && id !== req.user.sub);
    if (others.length) {
      const from = [message.sender?.firstName, message.sender?.lastName]
        .filter(Boolean).join(' ').trim() || 'Someone';
      await safeNotify(() => notifyUsers(others, {
        // Its own type so it lands on its own Android channel: a busy group
        // chat must be silenceable without also silencing match alerts.
        type: 'chat',
        title: message.chatRoom?.name || 'New message',
        // Named sender first: a group chat's own name is already the title, so
        // without this you cannot tell who said it without opening the app.
        message: `${from}: ${message.text.slice(0, 80)}`,
        data: { chatId: req.params.roomId, chatName: message.chatRoom?.name || 'Chat' },
      }));
    }

    res.status(201).json({ message });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
