-- Two nullable, additive columns. No existing data is read or rewritten.
--
-- requestNote: one line a requester sends with a join request, so the organiser
-- has context without opening a chat to ask.
-- lastReadAt:  when a chat member last opened the room. NULL = never, so every
-- message counts as unread — which is the correct reading for existing rows.
ALTER TABLE "TournamentTeam" ADD COLUMN "requestNote" TEXT;
ALTER TABLE "ChatMember" ADD COLUMN "lastReadAt" TIMESTAMP(3);
