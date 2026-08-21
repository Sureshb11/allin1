-- Tournament join requests: record WHO asked, and the room they talk in.
--
-- A join request only ever stored which TEAM asked, never which person, so the
-- organiser had nobody to reply to. Both columns are nullable and additive:
-- existing rows (and any team the organiser added directly, which involves no
-- request) simply carry NULL. No data is read or rewritten.
ALTER TABLE "TournamentTeam" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "TournamentTeam" ADD COLUMN "chatRoomId" TEXT;
