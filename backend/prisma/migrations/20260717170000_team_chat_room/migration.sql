-- The team's group chat room, created on first open (mirrors how tournament
-- join-request chats are linked via a plain chatRoomId column).

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "chatRoomId" TEXT;
