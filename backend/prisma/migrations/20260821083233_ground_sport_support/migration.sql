-- CreateTable
CREATE TABLE "GroundSport" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "configuration" JSONB,
    "pricing" JSONB,
    "availability" JSONB,
    "facilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroundSport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroundSport_sport_idx" ON "GroundSport"("sport");

-- CreateIndex
CREATE UNIQUE INDEX "GroundSport_groundId_sport_key" ON "GroundSport"("groundId", "sport");

-- AddForeignKey
ALTER TABLE "GroundSport" ADD CONSTRAINT "GroundSport_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;
