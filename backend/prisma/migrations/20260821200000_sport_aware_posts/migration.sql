-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "matchId" TEXT,
ADD COLUMN     "mediaType" TEXT,
ADD COLUMN     "playerId" TEXT,
ADD COLUMN     "postType" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "tournamentId" TEXT;

-- CreateIndex
CREATE INDEX "Post_matchId_idx" ON "Post"("matchId");

-- CreateIndex
CREATE INDEX "Post_tournamentId_idx" ON "Post"("tournamentId");

-- CreateIndex
CREATE INDEX "Post_playerId_idx" ON "Post"("playerId");

