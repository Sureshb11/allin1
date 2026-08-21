-- Per-delivery bowler on Ball, to support shared overs (bowler change mid-over).
-- Nullable: existing rows fall back to Over.bowlerId in application logic.

-- AlterTable
ALTER TABLE "Ball" ADD COLUMN "bowlerId" TEXT;

-- CreateIndex
CREATE INDEX "Ball_bowlerId_idx" ON "Ball"("bowlerId");

-- AddForeignKey
ALTER TABLE "Ball" ADD CONSTRAINT "Ball_bowlerId_fkey" FOREIGN KEY ("bowlerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
