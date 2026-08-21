-- Match photos: when a photo is added from a completed match it is linked to
-- the match (and stored under each team, so it shows in both teams' galleries).

-- AlterTable
ALTER TABLE "GalleryPhoto" ADD COLUMN "matchId" TEXT;

-- CreateIndex
CREATE INDEX "GalleryPhoto_matchId_idx" ON "GalleryPhoto"("matchId");
