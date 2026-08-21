-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "News" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "Stream" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- CreateIndex
CREATE INDEX "Club_sport_idx" ON "Club"("sport");

-- CreateIndex
CREATE INDEX "News_sport_idx" ON "News"("sport");

-- CreateIndex
CREATE INDEX "Product_sport_idx" ON "Product"("sport");

-- CreateIndex
CREATE INDEX "Quiz_sport_idx" ON "Quiz"("sport");

-- CreateIndex
CREATE INDEX "Stream_sport_idx" ON "Stream"("sport");

