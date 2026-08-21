-- AlterTable
ALTER TABLE "Ground" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- CreateIndex
CREATE INDEX "Ground_sport_idx" ON "Ground"("sport");

-- CreateIndex
CREATE INDEX "Tournament_sport_idx" ON "Tournament"("sport");

