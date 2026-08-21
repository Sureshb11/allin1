-- Ball Intelligence: where each ball went, and how it was hit.
--
-- Two changes, both purely additive, both safe on a live table:
--
--   1. Match gains an opt-in flag that DEFAULTS TO FALSE, so every match that
--      already exists — and every match scored by someone who never turns this
--      on — behaves exactly as it does today. No backfill, no rewrite.
--
--   2. A new side table holding one optional shot record per delivery. Nothing
--      is added to "Ball" itself: that row is read by every live-state rebuild,
--      scorecard and career aggregation in the app, and this is optional
--      analytics most matches will never record. Keeping it separate means an
--      untracked match pays nothing for the feature existing.
--
-- No existing column is altered, dropped or re-typed, so an older API build
-- keeps working against this schema unchanged while the new one rolls out.

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "ballIntelligenceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BallIntelligence" (
    "id" TEXT NOT NULL,
    "ballId" TEXT NOT NULL,
    "shotAngle" DOUBLE PRECISION NOT NULL,
    "shotZone" TEXT NOT NULL,
    "shotDistance" INTEGER,
    "shotType" TEXT,
    "shotOutcome" TEXT,
    "connectionType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SCORER',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BallIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BallIntelligence_ballId_key" ON "BallIntelligence"("ballId");

-- CreateIndex
CREATE INDEX "BallIntelligence_shotZone_idx" ON "BallIntelligence"("shotZone");

-- CreateIndex
CREATE INDEX "BallIntelligence_shotType_idx" ON "BallIntelligence"("shotType");

-- AddForeignKey
--
-- ON DELETE CASCADE is load-bearing. Undoing a delivery deletes the "Ball" row,
-- and the shot must go with it — an orphaned shot would keep appearing on the
-- wagon wheel for a ball that no longer exists in the scorecard.
ALTER TABLE "BallIntelligence" ADD CONSTRAINT "BallIntelligence_ballId_fkey" FOREIGN KEY ("ballId") REFERENCES "Ball"("id") ON DELETE CASCADE ON UPDATE CASCADE;
