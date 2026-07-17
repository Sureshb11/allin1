-- Squad detail: shirt number and team-level captaincy for each player.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "jerseyNumber" INTEGER;
ALTER TABLE "Player" ADD COLUMN "isCaptain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "isViceCaptain" BOOLEAN NOT NULL DEFAULT false;
