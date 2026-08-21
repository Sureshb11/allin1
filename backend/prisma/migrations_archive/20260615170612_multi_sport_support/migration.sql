-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket',
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "sport" TEXT NOT NULL DEFAULT 'cricket';

-- CreateTable
CREATE TABLE "UserSport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "skill" TEXT,

    CONSTRAINT "UserSport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "eventType" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT,
    "periodNum" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "SportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSport_sport_idx" ON "UserSport"("sport");

-- CreateIndex
CREATE UNIQUE INDEX "UserSport_userId_sport_key" ON "UserSport"("userId", "sport");

-- CreateIndex
CREATE INDEX "SportEvent_matchId_idx" ON "SportEvent"("matchId");

-- CreateIndex
CREATE INDEX "SportEvent_sport_idx" ON "SportEvent"("sport");

-- CreateIndex
CREATE INDEX "Ball_overId_idx" ON "Ball"("overId");

-- CreateIndex
CREATE INDEX "Ball_batterId_idx" ON "Ball"("batterId");

-- CreateIndex
CREATE INDEX "Ball_dismissedPlayerId_idx" ON "Ball"("dismissedPlayerId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_groundId_idx" ON "Booking"("groundId");

-- CreateIndex
CREATE INDEX "Match_sport_status_idx" ON "Match"("sport", "status");

-- CreateIndex
CREATE INDEX "Match_startTime_idx" ON "Match"("startTime");

-- CreateIndex
CREATE INDEX "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");

-- CreateIndex
CREATE INDEX "MatchPlayer_teamId_idx" ON "MatchPlayer"("teamId");

-- CreateIndex
CREATE INDEX "Over_bowlerId_idx" ON "Over"("bowlerId");

-- CreateIndex
CREATE INDEX "Player_sport_idx" ON "Player"("sport");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Team_sport_idx" ON "Team"("sport");

-- AddForeignKey
ALTER TABLE "UserSport" ADD CONSTRAINT "UserSport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportEvent" ADD CONSTRAINT "SportEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

