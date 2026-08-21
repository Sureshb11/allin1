-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_team1Id_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_team2Id_fkey";

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "participantType" TEXT NOT NULL DEFAULT 'TEAM',
ADD COLUMN     "player1Id" TEXT,
ADD COLUMN     "player2Id" TEXT,
ALTER COLUMN "team1Id" DROP NOT NULL,
ALTER COLUMN "team2Id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TournamentParticipant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tournamentId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL DEFAULT 'TEAM',
    "teamId" TEXT,
    "playerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "tied" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,

    CONSTRAINT "TournamentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentParticipant_playerId_idx" ON "TournamentParticipant"("playerId");

-- CreateIndex
CREATE INDEX "TournamentParticipant_teamId_idx" ON "TournamentParticipant"("teamId");

-- CreateIndex
CREATE INDEX "TournamentParticipant_tournamentId_idx" ON "TournamentParticipant"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentParticipant_participantType_idx" ON "TournamentParticipant"("participantType");

-- CreateIndex
CREATE INDEX "Match_player1Id_idx" ON "Match"("player1Id");

-- CreateIndex
CREATE INDEX "Match_player2Id_idx" ON "Match"("player2Id");

-- CreateIndex
CREATE INDEX "Match_participantType_idx" ON "Match"("participantType");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team1Id_fkey" FOREIGN KEY ("team1Id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team2Id_fkey" FOREIGN KEY ("team2Id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreatePartialUniqueIndexes
CREATE UNIQUE INDEX "TournamentParticipant_team_unique" ON "TournamentParticipant"("tournamentId", "teamId") WHERE "participantType" = 'TEAM' AND "teamId" IS NOT NULL;
CREATE UNIQUE INDEX "TournamentParticipant_player_unique" ON "TournamentParticipant"("tournamentId", "playerId") WHERE "participantType" = 'PLAYER' AND "playerId" IS NOT NULL;
