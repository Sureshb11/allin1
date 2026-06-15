-- AlterTable
ALTER TABLE "LookingFor" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- CreateIndex
CREATE INDEX "LookingFor_sport_status_idx" ON "LookingFor"("sport", "status");

-- CreateIndex
CREATE INDEX "LookingFor_type_idx" ON "LookingFor"("type");

