-- Tournament ownership + team join requests.
-- organizerId records the creating user so admin actions can be gated to them.
-- TournamentTeam.status distinguishes an approved entry from a pending join request.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "organizerId" TEXT;

-- AlterTable
ALTER TABLE "TournamentTeam" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';
