import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// Get chat rooms for user
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const memberships = await prisma.chatMember.findMany({
      where: { userId: req.user.sub },
      include: {
        chatRoom: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
          },
        },
      },
    });
    const rooms = memberships.map(m => m.chatRoom);
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
        sender: { select: { id: true, firstName: true, lastName: true } },
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
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.status(201).json({ message });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
